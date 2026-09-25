import type { Locator, Page } from "@playwright/test";
import {
  test,
  expect,
  signIn,
  createOrganization,
  createVehicle,
  saveMileage,
  browserRequest,
} from "./fixtures";

async function saveForm(
  page: Page,
  form: Locator,
  button: string,
  status = 201,
) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/maintenance") && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: button, exact: true }).click();
  expect((await response).status()).toBe(status);
}
async function createTemplate(
  page: Page,
  organization: string,
  name: string,
  distance?: string,
  time?: string,
  unit = "mi",
) {
  await page.goto(`/organizations/${organization}/maintenance`);
  const form = page.getByRole("group", {
    name: "Create maintenance template",
    exact: true,
  });
  await form.getByLabel("Service name").fill(name);
  if (distance) {
    await form.getByLabel("Distance interval", { exact: true }).fill(distance);
    await form.getByLabel("Distance unit", { exact: true }).selectOption(unit);
  }
  if (time) {
    await form.getByLabel("Calendar interval", { exact: true }).fill(time);
    await form
      .getByLabel("Calendar unit", { exact: true })
      .selectOption("days");
  }
  await saveForm(page, form, "Create template");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function assign(
  page: Page,
  vehicle: string,
  name: string,
  usage?: string,
  date?: string,
) {
  await page.goto(`${vehicle}/maintenance`);
  const form = page.getByRole("group", {
    name: "Assign a maintenance template",
    exact: true,
  });
  await form
    .getByLabel("Maintenance template", { exact: true })
    .selectOption({ label: name });
  if (usage) await form.getByLabel("Next due accumulated usage").fill(usage);
  if (date) await form.getByLabel("Next due date").fill(date);
  await saveForm(page, form, "Assign schedule");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
function schedule(page: Page, name: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
function dateOffset(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}

test("maintenance follows logical mileage, supports schedule edits and pause/disable, and excludes archived vehicles", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(300_000);
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const org = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, org);
  await page.goto(`${vehicle}/mileage`);
  await saveMileage(page, { physical: "10000", observed: "2020-01-01T12:00" });
  await createTemplate(page, org, "Oil", "1000");
  await assign(page, vehicle, "Oil", "10100");
  await expect(
    schedule(page, "Oil").getByText("Upcoming", { exact: true }),
  ).toBeVisible();
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.locator("ol > li")).toHaveCount(1);
  await expect(page.locator("ol > li")).toContainText("Upcoming");
  await page.goto(`${vehicle}/mileage`);
  await saveMileage(page, { physical: "10050", observed: "2020-01-02T12:00" });
  await page.goto(vehicle);
  await expect(schedule(page, "Maintenance")).toContainText("Due");
  await page.goto(`${vehicle}/mileage`);
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  await saveMileage(page, {
    physical: "0",
    oldFinal: "10101",
    observed: "2020-01-03T12:00",
    reason: "Replacement",
  });
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.locator("ol > li")).toContainText("Overdue");
  await expect(page.locator("ol > li")).toContainText("1 mi overdue");
  await page.goto(`${vehicle}/mileage`);
  await page
    .locator("ol > li")
    .filter({ hasText: "2020-01-03" })
    .getByRole("button", { name: "Correct", exact: true })
    .click();
  await saveMileage(page, {
    physical: "0",
    oldFinal: "10050",
    reason: "Correct final reading",
  });
  await page.goto(`${vehicle}/maintenance`);
  await expect(
    schedule(page, "Oil").getByText("Due", { exact: true }),
  ).toBeVisible();
  await schedule(page, "Oil")
    .getByText("Edit schedule", { exact: true })
    .click();
  await schedule(page, "Oil").getByLabel("Pause this vehicle schedule").check();
  await saveForm(page, schedule(page, "Oil"), "Save schedule", 200);
  await expect(
    schedule(page, "Oil").getByText("Paused", { exact: true }),
  ).toBeVisible();
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.getByText("No active maintenance alerts.")).toBeVisible();
  await page.goto(`${vehicle}/maintenance`);
  await schedule(page, "Oil")
    .getByText("Edit schedule", { exact: true })
    .click();
  await schedule(page, "Oil")
    .getByLabel("Pause this vehicle schedule")
    .uncheck();
  await saveForm(page, schedule(page, "Oil"), "Save schedule", 200);
  await expect(
    schedule(page, "Oil").getByText("Due", { exact: true }),
  ).toBeVisible();
  await page.goto(`/organizations/${org}/maintenance`);
  // The same text also names the fieldset legend inside the disclosure.
  const editTemplate = schedule(page, "Oil")
    .locator("summary")
    .filter({ hasText: /^Edit template$/ });
  await expect(editTemplate).toHaveCount(1);
  await editTemplate.focus();
  await page.keyboard.press("Enter");
  await expect(
    schedule(page, "Oil").getByRole("group", {
      name: "Edit template",
      exact: true,
    }),
  ).toBeVisible();
  await schedule(page, "Oil")
    .getByLabel("Distance interval", { exact: true })
    .fill("2000");
  await schedule(page, "Oil").getByLabel("Template enabled").uncheck();
  await saveForm(page, schedule(page, "Oil"), "Save template", 200);
  await expect(
    schedule(page, "Oil").getByText("Disabled", { exact: true }),
  ).toBeVisible();
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.getByText("No active maintenance alerts.")).toBeVisible();
  await page.goto(`/organizations/${org}/maintenance`);
  await schedule(page, "Oil")
    .locator("summary")
    .filter({ hasText: /^Edit template$/ })
    .click();
  await schedule(page, "Oil").getByLabel("Template enabled").check();
  await saveForm(page, schedule(page, "Oil"), "Save template", 200);
  await expect(
    schedule(page, "Oil").getByText("Enabled", { exact: true }),
  ).toBeVisible();
  await page.goto(`${vehicle}/maintenance`);
  await schedule(page, "Oil")
    .getByText("Edit schedule", { exact: true })
    .click();
  await expect(
    schedule(page, "Oil").getByLabel("Distance interval", { exact: true }),
  ).toHaveValue("1000");
  await expect(
    schedule(page, "Oil").getByLabel("Next due accumulated usage"),
  ).toHaveValue("10100");
  await page.goto(vehicle);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Archive vehicle", exact: true })
    .click();
  await expect(page.getByText("Archived — read-only")).toBeVisible();
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.getByText("No active maintenance alerts.")).toBeVisible();
  await page.goto(`${vehicle}/maintenance`);
  await expect(
    schedule(page, "Oil").getByText("Archived", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("calendar-only schedules need no meter; combined schedules choose the earliest threshold and dashboard prioritizes urgency", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const org = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, org);
  await createTemplate(page, org, "Inspection", undefined, "100");
  await assign(page, vehicle, "Inspection", undefined, dateOffset(7));
  await expect(
    schedule(page, "Inspection").getByText("Upcoming", { exact: true }),
  ).toBeVisible();
  await schedule(page, "Inspection")
    .getByText("Edit schedule", { exact: true })
    .click();
  await schedule(page, "Inspection")
    .getByLabel("Next due date")
    .fill(dateOffset(2));
  await saveForm(page, schedule(page, "Inspection"), "Save schedule", 200);
  await expect(
    schedule(page, "Inspection").getByText("Due", { exact: true }),
  ).toBeVisible();
  await page.goto(`${vehicle}/mileage`);
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("km");
  await saveMileage(page, { physical: "10000", observed: "2020-01-01T12:00" });
  await createTemplate(page, org, "Combined", "1000", "100", "km");
  await assign(page, vehicle, "Combined", "20000", dateOffset(-1));
  await expect(
    schedule(page, "Combined").getByText("Overdue", { exact: true }),
  ).toBeVisible();
  await createTemplate(page, org, "Distance", "1000", undefined, "km");
  await assign(page, vehicle, "Distance", "10080");
  await page.goto(`/organizations/${org}/dashboard`);
  const alerts = page.locator("ol > li");
  await expect(alerts).toHaveCount(3);
  await expect(alerts.nth(0)).toContainText("Combined");
  await expect(alerts.nth(0)).toContainText("Overdue");
  await expect(alerts.nth(1)).toContainText("Inspection");
  await expect(alerts.nth(1)).toContainText("Due");
  await expect(alerts.nth(2)).toContainText("Distance");
  await expect(alerts.nth(2)).toContainText("Upcoming");
  await page.goto(`${vehicle}/maintenance`);
  await schedule(page, "Combined")
    .getByText("Edit schedule", { exact: true })
    .click();
  await schedule(page, "Combined")
    .getByLabel("Next due date")
    .fill(dateOffset(50));
  await schedule(page, "Combined")
    .getByLabel("Next due accumulated usage")
    .fill("9999");
  await saveForm(page, schedule(page, "Combined"), "Save schedule", 200);
  await expect(schedule(page, "Combined")).toContainText("1 km overdue");
  await page.reload();
  await schedule(page, "Combined")
    .getByText("Edit schedule", { exact: true })
    .click();
  await schedule(page, "Combined")
    .getByLabel("Distance unit", { exact: true })
    .selectOption("mi");
  await saveForm(page, schedule(page, "Combined"), "Save schedule", 400);
  await expect(schedule(page, "Combined").getByRole("alert")).toBeVisible();
});

test("maintenance owners/admins manage, readers view, and drivers, foreign tenants and revoked sessions are denied", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner");
  const admin = await fixtures.user("admin");
  const reader = await fixtures.user("reader");
  const driver = await fixtures.user("driver");
  const foreign = await fixtures.user("foreign");
  await signIn(page, owner);
  const org = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, org);
  await fixtures.membership(org, admin, "admin");
  await fixtures.membership(org, reader, "read_only");
  await fixtures.membership(org, driver, "driver");
  await signIn(page, admin);
  await createTemplate(page, org, "Inspection", undefined, "30");
  await assign(page, vehicle, "Inspection", undefined, dateOffset(-1));
  await signIn(page, reader);
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.locator("ol > li")).toContainText("Overdue");
  for (const path of [
    `/organizations/${org}/maintenance`,
    `${vehicle}/maintenance`,
  ]) {
    await page.goto(path);
    await expect(page.getByText("Maintenance is read-only.")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
    expect((await browserRequest(page, `/api${path}`, "POST", {})).status).toBe(
      403,
    );
  }
  await signIn(page, foreign);
  const foreignOrg = await createOrganization(
    page,
    fixtures,
    foreign,
    "foreign",
  );
  expect(
    (
      await browserRequest(
        page,
        `/api/organizations/${foreignOrg}/vehicles/${vehicle.split("/").at(-1)}/maintenance`,
      )
    ).status,
  ).toBe(404);
  for (const user of [foreign, driver]) {
    await signIn(page, user);
    for (const path of [
      `/organizations/${org}/maintenance`,
      `${vehicle}/maintenance`,
    ]) {
      expect((await browserRequest(page, `/api${path}`)).status).toBe(404);
      expect(
        (await browserRequest(page, `/api${path}`, "POST", {})).status,
      ).toBe(404);
    }
    await page.goto(`/organizations/${org}/dashboard`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  }
  await signIn(page, admin);
  await page.goto(`/organizations/${org}/dashboard`);
  await expect(page.locator("ol > li")).toHaveCount(1);
  await fixtures.membership(org, admin, "admin", "revoked");
  expect(
    (
      await browserRequest(
        page,
        `/api/organizations/${org}/maintenance`,
        "POST",
        {},
      )
    ).status,
  ).toBe(404);
  await page.reload();
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});
