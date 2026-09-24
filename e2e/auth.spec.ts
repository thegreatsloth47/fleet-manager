import {
  test,
  expect,
  signIn,
  createOrganization,
  browserRequest,
} from "./fixtures";

test("protected routes, failed login, real password login, organization creation and sign-out", async ({
  page,
  fixtures,
}) => {
  await page.goto("/organizations");
  await expect(page).toHaveURL(/\/auth$/);
  expect((await browserRequest(page, "/api/organizations")).status).toBe(401);
  const owner = await fixtures.user("owner");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Intentionally-Wrong-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Sign-in failed",
  );
  await signIn(page, owner);
  await expect(
    page.getByText("You have no active organization memberships."),
  ).toBeVisible();
  const organization = await test.step(
    "organization creation completes without reading the unconsumed POST body",
    () => createOrganization(page, fixtures, owner),
    { timeout: 30_000 },
  );
  const listed = await browserRequest(page, "/api/organizations");
  expect(listed.status).toBe(200);
  expect(listed.body).toMatchObject({
    organizations: [{ id: organization, role: "owner" }],
  });
  await expect(page.getByRole("status")).toContainText("You are its owner");
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Vehicles", exact: true }),
  ).toHaveAttribute("href", `/organizations/${organization}/vehicles`);
  await page.getByRole("link", { name: "Account and sign out" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto(`/organizations/${organization}/vehicles`);
  await expect(page).toHaveURL(/\/auth$/);
  expect(
    (await browserRequest(page, `/api/organizations/${organization}/vehicles`))
      .status,
  ).toBe(401);
});

test("generated signup link exercises the real confirmation handler and rejects reuse and invalid types", async ({
  page,
  fixtures,
}) => {
  const user = await fixtures.user("confirm", false);
  const link = await fixtures.confirmation(user);
  await page.goto(`${link}&next=https://example.com`);
  await expect(page).toHaveURL(/\/organizations$/);
  await expect(
    page.getByText("You have no active organization memberships."),
  ).toBeVisible();
  await page.goto("/auth");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const replay = await page.goto(link);
  expect(replay?.status()).toBe(400);
  const invalid = await page.goto(
    "/auth/confirm?token_hash=invalid&type=recovery",
  );
  expect(invalid?.status()).toBe(400);
  await signIn(page, user);
  await expect(
    page.getByRole("heading", { name: "Your organizations" }),
  ).toBeVisible();
});

test("delivered signup email end-to-end", async () => {
  test.skip(
    true,
    "Requires a controlled mailbox and hosted SMTP. Generated-link confirmation is tested separately.",
  );
});
