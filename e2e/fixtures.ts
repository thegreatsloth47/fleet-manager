import { test as base, expect, type Page } from "@playwright/test";
import { Fixtures, type TestUser } from "./admin";
export { expect };
export const test = base.extend<{ fixtures: Fixtures }>({
  fixtures: async ({}, runFixture, testInfo) => {
    const runId = process.env.E2E_RUN_ID;
    if (!runId)
      throw new Error("Use npm run test:e2e to create a tracked run.");
    const fixtures = new Fixtures(runId);
    try {
      await fixtures.verifyProject();
      await runFixture(fixtures);
    } finally {
      try {
        await fixtures.cleanup();
      } finally {
        await testInfo.attach("fixture-recovery-manifest", {
          path: fixtures.path,
          contentType: "application/json",
        });
      }
    }
  },
});

export async function signIn(page: Page, user: TestUser) {
  await page.goto("/auth");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations$/);
}

export async function createOrganization(
  page: Page,
  fixtures: Fixtures,
  owner: TestUser,
  label = "organization",
) {
  const name = fixtures.organizationIntent(owner, label);
  await page.goto("/organizations");
  await page.getByLabel("Name", { exact: true }).fill(name);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/organizations" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  // The form does not consume the fetch body. Chromium can leave that response
  // pending even after the server finishes, so read the persisted result in UI.
  const organization = page.getByRole("listitem").filter({ hasText: name });
  const vehicles = organization.getByRole("link", {
    name: "Vehicles",
    exact: true,
  });
  await expect(vehicles).toBeVisible();
  const href = await vehicles.getAttribute("href");
  const match = href?.match(
    /^\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/vehicles$/,
  );
  if (!match) throw new Error("Invalid organization Vehicles link.");
  const id = match[1];
  await fixtures.registerOrganization(name, id);
  return id;
}

export async function createVehicle(
  page: Page,
  fixtures: Fixtures,
  organization: string,
  label = "vehicle",
  vin?: string,
) {
  await page.goto(`/organizations/${organization}/vehicles`);
  await page.getByRole("link", { name: "Add vehicle", exact: true }).click();
  await page
    .getByLabel("Display name/number")
    .fill(`${fixtures.prefix}-${label}`);
  if (vin) await page.getByLabel("VIN", { exact: true }).fill(vin);
  await page.getByRole("button", { name: "Save vehicle", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/organizations/${organization}/vehicles/[0-9a-f-]{36}$`),
  );
  return new URL(page.url()).pathname;
}

export async function browserRequest(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    { path, method, body },
  );
}

export async function saveMileage(
  page: Page,
  values: {
    physical?: string;
    observed?: string;
    accumulated?: string;
    oldFinal?: string;
    reason?: string;
  },
  expectedStatus = 201,
) {
  const form = page.getByRole("region", { name: "Record mileage" });
  // Use canonical datetime-local values: Chromium strips zero seconds, and
  // Playwright rejects a fill when the browser changes the supplied value.
  if (values.observed)
    await form
      .getByLabel("Observed at (your local time)")
      .fill(values.observed);
  if (values.physical !== undefined) {
    // Role names normalize the label's trailing JSX whitespace; label regexes do not.
    const physical = form.getByRole("spinbutton", {
      name: /^(Physical odometer reading|New odometer starting reading)$/,
    });
    await physical.fill(values.physical);
    await expect(physical).toHaveValue(values.physical);
  }
  if (values.accumulated !== undefined)
    await form
      .getByLabel("Declared accumulated usage")
      .fill(values.accumulated);
  if (values.oldFinal !== undefined)
    await form.getByLabel("Old odometer final reading").fill(values.oldFinal);
  if (values.reason)
    await form.getByLabel("Reason / notes").fill(values.reason);
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/mileage") &&
      response.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: /^(Save mileage|Confirm void)$/ })
    .click();
  expect((await response).status()).toBe(expectedStatus);
  await expect(form.locator("fieldset")).toBeEnabled();
  if (expectedStatus === 201)
    await expect(page.getByRole("status")).toHaveText("Mileage saved.");
}

export async function usage(
  page: Page,
  physical: string,
  accumulated: string,
  unit = "mi",
) {
  await expect(page.locator("dl dd").nth(0)).toHaveText(`${physical} ${unit}`);
  await expect(page.locator("dl dd").nth(1)).toHaveText(
    `${accumulated} ${unit}`,
  );
}
