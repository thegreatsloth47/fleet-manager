import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  signIn,
  createOrganization,
  createVehicle,
  saveMileage,
  browserRequest,
} from "./fixtures";

async function createSchedule(
  page: Page,
  organization: string,
  vehicle: string,
  name: string,
  distance: boolean,
) {
  const template = randomUUID();
  const rule = {
    name,
    distance_interval: distance ? 1000 : null,
    distance_unit: distance ? "mi" : null,
    time_interval: 6,
    time_unit: "months",
    upcoming_percent: 10,
    due_percent: 5,
  };
  expect(
    (
      await browserRequest(
        page,
        `/api/organizations/${organization}/maintenance`,
        "POST",
        { ...rule, id: template, expected_version: 0, enabled: true },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await browserRequest(page, `/api${vehicle}/maintenance`, "POST", {
        ...rule,
        id: randomUUID(),
        expected_version: 0,
        template_id: template,
        next_due_usage: distance ? 10100 : null,
        next_due_date: "2020-01-01",
        paused: false,
      })
    ).status,
  ).toBe(201);
}
async function saveServiceForm(page: Page, status = 201) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/service-history") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save service", exact: true }).click();
  expect((await response).status()).toBe(status);
}

test("completed service advances selected schedules and rejects conflicting backdated effects", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const org = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, org);
  await page.getByRole("link", { name: "Mileage", exact: true }).click();
  await saveMileage(page, { physical: "10000", observed: "2020-01-01T12:00" });
  await saveMileage(page, { physical: "20000", observed: "2020-12-01T12:00" });
  await createSchedule(page, org, vehicle, "Combined", true);
  await createSchedule(page, org, vehicle, "Inspection", false);
  await page.goto(vehicle);
  await page
    .getByRole("link", { name: "Service history", exact: true })
    .click();
  await page.getByLabel("Service date", { exact: true }).fill("2020-02-29");
  await page.getByLabel("Service title").fill("Oil and inspection");
  await page.getByLabel("Provider / shop").fill("Local shop");
  await page.getByLabel("Cost (USD)").fill("123.45");
  await page.getByLabel("Total distance at service (mi)").fill("11000");
  await page.getByRole("checkbox", { name: "Combined", exact: true }).check();
  await page.getByRole("checkbox", { name: "Inspection", exact: true }).check();
  await saveServiceForm(page);
  const service = page.getByRole("region", {
    name: "Oil and inspection",
    exact: true,
  });
  await expect(service).toContainText("$123.45 USD");
  await service.getByText("Change history and schedule effects").click();
  await expect(service).toContainText("Combined — Applied");
  await expect(service).toContainText("Inspection — Applied");
  await page
    .getByRole("link", { name: "Maintenance schedules", exact: true })
    .click();
  await expect(page.getByText(/Next due: 12000 mi/)).toBeVisible();
  await expect(page.getByText(/Next due date: 2020-08-29/)).toHaveCount(2);

  await page.goto(`${vehicle}/service-history`);
  await page.getByLabel("Service date", { exact: true }).fill("2020-01-15");
  await page.getByLabel("Service title").fill("Older service");
  await page.getByLabel("Total distance at service (mi)").fill("10500");
  await page.getByRole("checkbox", { name: "Combined", exact: true }).check();
  await saveServiceForm(page, 409);
  await expect(page.getByRole("status")).toContainText(
    "later service/manual change",
  );
  await expect(
    page.getByRole("region", { name: "Older service", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Combined", exact: true }).uncheck();
  await saveServiceForm(page);
  await expect(
    page.getByRole("region", { name: "Older service", exact: true }),
  ).toContainText("10500 mi");
  await page.goto(`${vehicle}/maintenance`);
  await expect(page.getByText(/Next due: 12000 mi/)).toBeVisible();
  await expect(page.getByText(/Next due date: 2020-08-29/)).toHaveCount(2);
});

test("service permissions preserve owner/admin writes, reader access, driver restrictions and archived history", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner"),
    admin = await fixtures.user("admin"),
    reader = await fixtures.user("reader"),
    driver = await fixtures.user("driver"),
    foreign = await fixtures.user("foreign");
  await signIn(page, owner);
  const org = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, org);
  for (const [user, role] of [
    [admin, "admin"],
    [reader, "read_only"],
    [driver, "driver"],
  ] as const)
    await fixtures.membership(org, user, role);
  await signIn(page, admin);
  await page.goto(`${vehicle}/service-history`);
  await page.getByLabel("Service title").fill("Repair");
  await page.getByLabel("Service date", { exact: true }).fill("2020-01-01");
  await saveServiceForm(page);
  const record = page.getByRole("region", { name: "Repair", exact: true });
  await expect(record).toContainText("Total distance: Unknown");
  await record.getByRole("button", { name: "Edit service" }).click();
  await page.getByLabel("Provider / shop").fill("Updated shop");
  await page.getByLabel("Reason for change").fill("Add shop name");
  await saveServiceForm(page, 200);
  await expect(record).toContainText("Updated shop");
  await signIn(page, reader);
  await page.goto(`${vehicle}/service-history`);
  await expect(record).toBeVisible();
  await expect(page.getByText("Service history is read-only.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  expect(
    (await browserRequest(page, `/api${vehicle}/service-history`, "POST", {}))
      .status,
  ).toBe(403);
  for (const user of [driver, foreign]) {
    await signIn(page, user);
    expect(
      (await browserRequest(page, `/api${vehicle}/service-history`)).status,
    ).toBe(404);
    expect(
      (await browserRequest(page, `/api${vehicle}/service-history`, "POST", {}))
        .status,
    ).toBe(404);
    await page.goto(`${vehicle}/service-history`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  }
  await signIn(page, owner);
  expect(
    (await browserRequest(page, `/api${vehicle}/archive`, "POST", {})).status,
  ).toBe(200);
  await page.goto(`${vehicle}/service-history`);
  await expect(record).toBeVisible();
  await expect(page.getByText("Service history is read-only.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  expect(
    (
      await browserRequest(page, `/api${vehicle}/service-history`, "POST", {
        command_id: randomUUID(),
        id: randomUUID(),
        expected_version: 0,
        action: "save",
        reason: null,
        service_date: "2020-01-01",
        title: "Blocked",
        provider: null,
        cost_cents: null,
        currency: "USD",
        notes: null,
        total_distance: null,
        schedule_ids: [],
      })
    ).status,
  ).toBe(409);
});
