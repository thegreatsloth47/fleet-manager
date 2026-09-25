import {
  test,
  expect,
  signIn,
  createOrganization,
  createVehicle,
  browserRequest,
} from "./fixtures";

test("vehicle create/edit, optional fields, uniqueness, archive and archived VIN reservation", async ({
  page,
  fixtures,
}) => {
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const organization = await createOrganization(page, fixtures, owner);
  const vin = `E2E-${crypto.randomUUID()}`.toUpperCase();
  const path = await createVehicle(
    page,
    fixtures,
    organization,
    "van",
    vin.toLowerCase(),
  );
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(vin);
  await page
    .getByLabel("Display name/number")
    .fill(`${fixtures.prefix}-edited`);
  await page.getByLabel("Make", { exact: true }).fill("Ford");
  await page.getByLabel("Model", { exact: true }).fill("Transit");
  await page.getByLabel("Year", { exact: true }).fill("2024");
  await page.getByLabel("License plate", { exact: true }).fill("E2E-123");
  await page.getByLabel("Plate jurisdiction").fill("MO");
  // A saved textarea's text joins the wrapping label text after a reload.
  // Its accessible textbox name remains Description for both empty and saved values.
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.fill("Isolated browser test vehicle");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("out_of_service");
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().endsWith(path.replace("/organizations/", "/api/organizations/")),
  );
  await page.getByRole("button", { name: "Save vehicle" }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: `${fixtures.prefix}-edited`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Make", { exact: true })).toHaveValue("Ford");
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("out_of_service");
  await expect(description).toHaveValue("Isolated browser test vehicle");
  await description.fill("");
  const cleared = page.waitForResponse((r) => r.request().method() === "PUT");
  await page.getByRole("button", { name: "Save vehicle" }).click();
  expect((await cleared).status()).toBe(200);
  await page.reload();
  await expect(description).toHaveValue("");

  await page.goto(`/organizations/${organization}/vehicles/new`);
  await page
    .getByLabel("Display name/number")
    .fill(`${fixtures.prefix}-edited`);
  {
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/vehicles"),
    );
    await page.getByRole("button", { name: "Save vehicle" }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole("status")).toContainText("already uses");
  }
  await page
    .getByLabel("Display name/number")
    .fill(`${fixtures.prefix}-different`);
  await page.getByLabel("VIN", { exact: true }).fill(` ${vin.toLowerCase()} `);
  {
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/vehicles"),
    );
    await page.getByRole("button", { name: "Save vehicle" }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole("status")).toContainText("already uses");
  }

  await page.goto(path);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Archive vehicle", exact: true })
    .click();
  await expect(page.getByText("Archived — read-only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save vehicle" })).toHaveCount(
    0,
  );
  expect(
    (
      await browserRequest(page, `/api${path}`, "PUT", {
        name: `${fixtures.prefix}-restore`,
      })
    ).status,
  ).toBe(409);
  await page.getByRole("link", { name: "Vehicles", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Archived vehicles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `${fixtures.prefix}-edited` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View current vehicles" }).click();
  await expect(
    page.getByRole("link", { name: `${fixtures.prefix}-edited` }),
  ).toHaveCount(0);
  await createVehicle(page, fixtures, organization, "edited"); // Archived display names can be reused.
  await page.goto(`/organizations/${organization}/vehicles/new`);
  await page
    .getByLabel("Display name/number")
    .fill(`${fixtures.prefix}-reserved-vin`);
  await page.getByLabel("VIN", { exact: true }).fill(vin);
  {
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/vehicles"),
    );
    await page.getByRole("button", { name: "Save vehicle" }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole("status")).toContainText("already uses");
  }
});
