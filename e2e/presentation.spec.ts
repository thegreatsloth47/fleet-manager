import type { Page } from "@playwright/test";
import {
  test,
  expect,
  signIn,
  createOrganization,
  createVehicle,
  saveMileage,
  organizationPath,
  apiPath,
  browserRequest,
} from "./fixtures";

async function fitsViewport(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test("public introduction fits phone and desktop and opens account entry", async ({
  page,
}) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page).toHaveTitle(
      "FleetFalcon | Fleet maintenance for small businesses",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Less spreadsheet work. More clarity on maintenance.",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);
    const start = page.getByRole("link", { name: "Get started", exact: true });
    await start.focus();
    await expect(start).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign up", exact: true }),
    ).toBeVisible();
  }
});

test.describe("mobile online management", () => {
  test.use({
    viewport: { width: 320, height: 800 },
    isMobile: true,
    hasTouch: true,
  });

  test("owner records a vehicle, mileage and scheduled service; reader preserves read-only history", async ({
    page,
    fixtures,
  }) => {
    test.setTimeout(240_000);
    const owner = await fixtures.user("mobile-owner");
    const reader = await fixtures.user("mobile-reader");
    await signIn(page, owner);
    await fitsViewport(page);
    const org = await createOrganization(page, fixtures, owner);
    const vehicle = await createVehicle(page, fixtures, org);
    await fitsViewport(page);
    const saveVehicle = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    expect((await saveVehicle.boundingBox())?.height).toBeGreaterThanOrEqual(
      44,
    );
    await page.getByRole("link", { name: "Mileage", exact: true }).tap();
    await fitsViewport(page);
    await saveMileage(page, {
      physical: "10000",
      observed: "2020-01-01T12:00",
    });
    await page
      .getByRole("link", { name: "Maintenance schedules", exact: true })
      .tap();
    await page
      .getByRole("link", { name: "Create a maintenance template", exact: true })
      .tap();
    const template = page.getByRole("group", {
      name: "Create maintenance template",
      exact: true,
    });
    await template.getByLabel("Service name").fill("Oil change");
    await template
      .getByLabel("Distance between services", { exact: true })
      .fill("1000");
    await template
      .getByLabel("Distance unit", { exact: true })
      .selectOption("mi");
    await fitsViewport(page);
    const templateSaved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/maintenance") && r.request().method() === "POST",
    );
    await template
      .getByRole("button", { name: "Create template", exact: true })
      .tap();
    expect((await templateSaved).status()).toBe(201);
    await expect(
      page.getByRole("heading", { name: "Oil change", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Back to .+ maintenance$/ }).tap();
    const schedule = page.getByRole("group", {
      name: "Add a maintenance schedule",
      exact: true,
    });
    await schedule
      .getByLabel("Maintenance template", { exact: true })
      .selectOption({ label: "Oil change" });
    await schedule.getByLabel("Next due at").fill("10100");
    await fitsViewport(page);
    const scheduleSaved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/maintenance") && r.request().method() === "POST",
    );
    await schedule
      .getByRole("button", { name: "Add schedule", exact: true })
      .tap();
    expect((await scheduleSaved).status()).toBe(201);
    await expect(
      page.getByRole("heading", { name: "Oil change", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Dashboard", exact: true }).tap();
    await expect(page.locator("ol > li")).toContainText("Upcoming");
    await fitsViewport(page);
    await page.locator(`a[href="${vehicle}"]`).tap();
    await page
      .getByRole("link", { name: "Service history", exact: true })
      .tap();
    await page.getByLabel("Service title").fill("Mobile service");
    await page.getByLabel("Service date", { exact: true }).fill("2020-01-02");
    await page.getByLabel("Total distance at service (mi)").fill("10000");
    await page
      .getByRole("checkbox", { name: "Oil change", exact: true })
      .check();
    await fitsViewport(page);
    const serviceSaved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/service-history") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save service", exact: true }).tap();
    expect((await serviceSaved).status()).toBe(201);
    await expect(
      page.getByRole("region", { name: "Mobile service", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Maintenance schedules", exact: true })
      .tap();
    await expect(page.getByText(/Next due: 11000 mi/)).toBeVisible();
    await page.getByRole("link", { name: "Dashboard", exact: true }).tap();
    await expect(page.getByText("No active maintenance alerts.")).toBeVisible();
    await fitsViewport(page);

    await fixtures.membership(org, reader, "read_only");
    await signIn(page, reader);
    await page.goto(`${vehicle}/service-history`);
    await expect(page.getByText("Service history is read-only.")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Mobile service", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save service", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await browserRequest(
          page,
          `${apiPath(vehicle)}/service-history`,
          "POST",
          {},
        )
      ).status,
    ).toBe(403);
    await fitsViewport(page);
    await page.goto(`${organizationPath(org)}/dashboard`);
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await fitsViewport(page);
  });
});

test("keyboard users can skip directly to page content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#page-content")).toBeFocused();
});
