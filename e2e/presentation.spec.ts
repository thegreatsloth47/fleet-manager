import { test, expect } from "./fixtures";

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
