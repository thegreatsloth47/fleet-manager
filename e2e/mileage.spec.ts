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

test("mileage, backdating, corrections, void/restoration, multiple replacements and preserved evidence", async ({
  page,
  fixtures,
}) => {
  test.setTimeout(240_000);
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const organization = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, organization);
  await page
    .getByRole("link", { name: "Mileage and odometer history" })
    .click();
  await expect(page.getByText("No mileage recorded yet.")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Unit", exact: true }),
  ).toHaveValue("mi");
  await saveMileage(page, { observed: "2020-01-01T12:00", physical: "100" });
  await usage(page, "100", "100");
  await expect(
    page.getByRole("combobox", { name: "Unit", exact: true }),
  ).toHaveCount(0);
  await saveMileage(page, { observed: "2020-01-03T12:00", physical: "150" });
  await usage(page, "150", "150");
  await saveMileage(page, { observed: "2020-01-02T12:00", physical: "125" });
  await usage(page, "150", "150");
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  await saveMileage(page, {
    observed: "2020-01-04T12:00",
    physical: "10",
    oldFinal: "200",
    reason: "Broken physical odometer",
  });
  await usage(page, "10", "200");
  await saveMileage(page, { observed: "2020-01-05T12:00", physical: "30" });
  await usage(page, "30", "220");
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  await saveMileage(page, {
    observed: "2020-01-06T12:00",
    physical: "1000",
    oldFinal: "50",
    reason: "Second physical replacement",
  });
  await usage(page, "1000", "240");
  await saveMileage(page, {
    observed: "2020-01-07T12:00",
    physical: "1010",
  });
  await usage(page, "1010", "250");

  const firstReplacement = page
    .locator("ol > li")
    .filter({ hasText: "2020-01-04" });
  await firstReplacement
    .getByRole("button", { name: "Correct", exact: true })
    .click();
  await saveMileage(page, {
    physical: "10",
    oldFinal: "210",
    reason: "Correct final reading typo",
  });
  await usage(page, "1010", "260");
  await firstReplacement.getByText("Original entry and audit history").click();
  await expect(firstReplacement).toContainText("Old meter final: 200");
  await expect(firstReplacement).toContainText("Old meter final: 210");
  await expect(firstReplacement).toContainText("Correct final reading typo");
  const latest = page.locator("ol > li").filter({ hasText: "2020-01-07" });
  await latest.getByRole("button", { name: "Void", exact: true }).click();
  await saveMileage(page, { reason: "Wrong vehicle" });
  await usage(page, "1000", "250");
  await expect(latest).toContainText("voided");
  await latest.getByRole("button", { name: "Correct and restore" }).click();
  await saveMileage(page, {
    physical: "1020",
    reason: "Verified correct vehicle and value",
  });
  await usage(page, "1020", "270");
  await latest.getByText("Original entry and audit history").click();
  await expect(latest).toContainText("Physical reading: 1010");
  await expect(latest).toContainText("Wrong vehicle");
  await expect(latest).toContainText("Physical reading: 1020");
  await latest.getByRole("button", { name: "Correct", exact: true }).click();
  await saveMileage(
    page,
    { physical: "999", reason: "Invalid decreasing correction" },
    400,
  );
  await usage(page, "1020", "270");

  await page.getByRole("button", { name: "Add reading", exact: true }).click();
  await saveMileage(
    page,
    { observed: "2020-01-04T18:00", physical: "35" },
    400,
  );
  await saveMileage(
    page,
    { observed: "2020-01-03T12:00", physical: "150" },
    409,
  );
  await saveMileage(
    page,
    { observed: "2999-01-01T12:00", physical: "1100" },
    400,
  );
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  await saveMileage(
    page,
    {
      observed: "2020-01-05T18:00",
      physical: "0",
      oldFinal: "40",
      reason: "Backdated replacement is disallowed",
    },
    400,
  );
  await page.reload();
  await usage(page, "1020", "270");

  await page.getByRole("link", { name: "Vehicle details" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Archive vehicle", exact: true })
    .click();
  await expect(page.getByText("Archived — read-only")).toBeVisible();
  await page
    .getByRole("link", { name: "Mileage and odometer history" })
    .click();
  await usage(page, "1020", "270");
  await expect(page.getByText("Mileage is read-only.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  expect(
    (
      await browserRequest(page, `/api${vehicle}/mileage`, "POST", {
        action: "reading",
      })
    ).status,
  ).toBe(409);
});

test("kilometer declared baseline, exact tenths and safe command retry through the user session", async ({
  page,
  fixtures,
}) => {
  const owner = await fixtures.user("owner");
  await signIn(page, owner);
  const organization = await createOrganization(page, fixtures, owner);
  const vehicle = await createVehicle(page, fixtures, organization);
  await page
    .getByRole("link", { name: "Mileage and odometer history" })
    .click();
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("km");
  await expect(
    page.getByRole("combobox", { name: "Unit", exact: true }),
  ).toHaveValue("km");
  await saveMileage(page, {
    observed: "2020-01-01T12:00",
    physical: "10.1",
    accumulated: "500.1",
    reason: "Known usage before earlier replacement",
  });
  await usage(page, "10.1", "500.1", "km");
  await page.getByRole("button", { name: "Replace/reset odometer" }).click();
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/mileage"),
  );
  await saveMileage(page, {
    observed: "2020-01-02T12:00",
    physical: "0.1",
    oldFinal: "20.3",
    reason: "Replacement",
  });
  const payload: unknown = (await sent).postDataJSON();
  await usage(page, "0.1", "510.3", "km");
  expect(
    (await browserRequest(page, `/api${vehicle}/mileage`, "POST", payload))
      .status,
  ).toBe(201);
  await page.reload();
  await usage(page, "0.1", "510.3", "km");
  await expect(page.locator("ol > li")).toHaveCount(2);
  await saveMileage(page, { observed: "2020-01-03T12:00", physical: "0.3" });
  await usage(page, "0.3", "510.5", "km");
  const baseline = page
    .locator("ol > li")
    .filter({ hasText: "Initial baseline" });
  await baseline.getByRole("button", { name: "Correct", exact: true }).click();
  await saveMileage(page, {
    physical: "10.1",
    accumulated: "600.1",
    reason: "Correct known accumulated baseline",
  });
  await usage(page, "0.3", "610.5", "km");
  const replacement = page
    .locator("ol > li")
    .filter({ hasText: "Physical replacement/reset" });
  await replacement
    .getByRole("button", { name: "Correct", exact: true })
    .click();
  await saveMileage(page, {
    physical: "0.2",
    oldFinal: "20.3",
    reason: "Correct new physical starting value",
  });
  await usage(page, "0.3", "610.4", "km");
  await replacement.getByText("Original entry and audit history").click();
  await expect(replacement).toContainText("Physical reading: 0.1");
  await expect(replacement).toContainText("Physical reading: 0.2");
});
