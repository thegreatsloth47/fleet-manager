import {
  test,
  expect,
  signIn,
  createOrganization,
  createVehicle,
  saveMileage,
  usage,
  browserRequest,
} from "./fixtures";

test("admin, read-only and driver roles enforce real server permissions; revocation affects an existing session", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner");
  const admin = await fixtures.user("admin");
  const reader = await fixtures.user("reader");
  const driver = await fixtures.user("driver");
  await signIn(page, owner);
  const organization = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, organization);
  await fixtures.membership(organization, admin, "admin");
  await fixtures.membership(organization, reader, "read_only");
  await fixtures.membership(organization, driver, "driver");

  await signIn(page, admin);
  const adminVehicle = await createVehicle(
    page,
    fixtures,
    organization,
    "admin-created",
  );
  await page.getByLabel("Make", { exact: true }).fill("Ford");
  const edit = page.waitForResponse(
    (response) => response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save vehicle" }).click();
  expect((await edit).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel("Make", { exact: true })).toHaveValue("Ford");
  await page
    .getByRole("link", { name: "Mileage and odometer history" })
    .click();
  await saveMileage(page, { physical: "100", observed: "2020-01-01T12:00:00" });
  await usage(page, "100", "100");
  await saveMileage(page, { physical: "120", observed: "2020-01-02T12:00:00" });
  await usage(page, "120", "120");
  await page
    .locator("ol > li")
    .first()
    .getByRole("button", { name: "Correct", exact: true })
    .click();
  await saveMileage(page, { physical: "125", reason: "Admin correction" });
  await usage(page, "125", "125");
  await page
    .locator("ol > li")
    .first()
    .getByRole("button", { name: "Void", exact: true })
    .click();
  await saveMileage(page, { reason: "Admin void" });
  await usage(page, "100", "100");
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  await saveMileage(page, {
    physical: "0",
    oldFinal: "130",
    observed: "2020-01-03T12:00:00",
    reason: "Admin replacement",
  });
  await usage(page, "0", "130");
  await page.goto(adminVehicle);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Archive vehicle", exact: true })
    .click();
  await expect(page.getByText("Archived — read-only")).toBeVisible();

  await signIn(page, reader);
  await page.goto(`/organizations/${organization}/vehicles`);
  await expect(page.getByRole("link", { name: "Add vehicle" })).toHaveCount(0);
  await page.goto(vehicle);
  await expect(page.getByRole("button", { name: "Save vehicle" })).toHaveCount(
    0,
  );
  await page.goto(`${adminVehicle}/mileage`);
  await usage(page, "0", "130");
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  for (const [path, method, body] of [
    [
      `/api/organizations/${organization}/vehicles`,
      "POST",
      { name: `${fixtures.prefix}-forbidden` },
    ],
    [`/api${vehicle}`, "PUT", { name: `${fixtures.prefix}-forbidden` }],
    [`/api${vehicle}/archive`, "POST", {}],
    ...["baseline", "reading", "correct", "void", "replacement"].map(
      (action) => [`/api${vehicle}/mileage`, "POST", { action }] as const,
    ),
  ] as const)
    expect((await browserRequest(page, path, method, body)).status).toBe(403);

  await signIn(page, driver);
  await expect(
    page.getByRole("link", { name: "Vehicles", exact: true }),
  ).toHaveCount(0);
  await page.goto(vehicle);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  expect((await browserRequest(page, `/api${vehicle}`)).status).toBe(404);
  expect((await browserRequest(page, `/api${vehicle}/mileage`)).status).toBe(
    404,
  );
  expect(
    (
      await browserRequest(page, `/api${vehicle}/mileage`, "POST", {
        action: "reading",
      })
    ).status,
  ).toBe(404);

  await signIn(page, admin);
  await page.goto(vehicle);
  await expect(
    page.getByRole("button", { name: "Save vehicle" }),
  ).toBeVisible();
  await fixtures.membership(organization, admin, "admin", "revoked");
  // Keep this browser and its authenticated session; no logout/token replacement.
  expect(
    (
      await browserRequest(page, `/api${vehicle}`, "PUT", {
        name: `${fixtures.prefix}-forbidden`,
      })
    ).status,
  ).toBe(404);
  expect((await browserRequest(page, `/api${vehicle}/mileage`)).status).toBe(
    404,
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await page.goto("/organizations");
  await expect(
    page.getByText("You have no active organization memberships."),
  ).toBeVisible();
});

test("tenant IDs cannot cross boundaries and roles remain organization-specific", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(180_000);
  const ownerA = await fixtures.user("owner-a");
  const ownerB = await fixtures.user("owner-b");
  const outsider = await fixtures.user("outsider");
  const vin = `E2E-${crypto.randomUUID()}`;
  await signIn(page, ownerA);
  const orgA = await createOrganization(page, fixtures, ownerA, "org-a");
  const vehicleA = await createVehicle(page, fixtures, orgA, "same-name", vin);
  await signIn(page, ownerB);
  const orgB = await createOrganization(page, fixtures, ownerB, "org-b");
  const vehicleB = await createVehicle(page, fixtures, orgB, "same-name", vin);
  expect(
    (await browserRequest(page, `/api/organizations?organization_id=${orgA}`))
      .status,
  ).toBe(404);
  for (const path of [vehicleA, `${vehicleA}/mileage`]) {
    expect((await browserRequest(page, `/api${path}`)).status).toBe(404);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  }
  expect(
    (
      await browserRequest(page, `/api${vehicleA}`, "PUT", {
        name: `${fixtures.prefix}-forbidden`,
      })
    ).status,
  ).toBe(404);
  const assetA = vehicleA.split("/").at(-1);
  expect(
    (
      await browserRequest(
        page,
        `/api/organizations/${orgB}/vehicles/${assetA}`,
      )
    ).status,
  ).toBe(404);
  await fixtures.membership(orgA, ownerB, "read_only");
  await page.goto(vehicleA);
  await expect(
    page.getByRole("heading", {
      name: `${fixtures.prefix}-same-name`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save vehicle" })).toHaveCount(
    0,
  );
  expect(
    (
      await browserRequest(page, `/api${vehicleA}`, "PUT", {
        name: `${fixtures.prefix}-forbidden`,
      })
    ).status,
  ).toBe(403);
  await page.goto(vehicleB);
  await expect(
    page.getByRole("button", { name: "Save vehicle" }),
  ).toBeVisible();
  await signIn(page, ownerA);
  expect((await browserRequest(page, `/api${vehicleB}`)).status).toBe(404);
  await signIn(page, outsider);
  await expect(
    page.getByText("You have no active organization memberships."),
  ).toBeVisible();
  for (const path of [vehicleA, vehicleB]) {
    expect((await browserRequest(page, `/api${path}`)).status).toBe(404);
    expect(
      (
        await browserRequest(page, `/api${path}/mileage`, "POST", {
          action: "reading",
        })
      ).status,
    ).toBe(404);
  }
});
