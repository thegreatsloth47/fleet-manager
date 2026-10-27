import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/modules/auth/actions", () => ({
  authenticate: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import AccountPage from "./page";
import AuthPage from "../auth/page";

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({
    data: { user: { email: "owner@example.com" } },
    error: null,
  });
});

test("account shows verified identity and sign-out without a login form", async () => {
  const html = renderToStaticMarkup(await AccountPage());
  expect(getUser).toHaveBeenCalledOnce();
  expect(html).toContain("<h1>Account</h1>");
  expect(html).toContain("owner@example.com");
  expect(html).toContain("Sign out");
  expect(html).toContain('href="/organizations"');
  expect(html).not.toContain('name="password"');
  expect(html).not.toContain("Sign up");
});

test("signed-in visitors to the login page are sent to account", async () => {
  await expect(AuthPage()).rejects.toThrow("REDIRECT:/account");
});

test.each([
  { data: { user: null }, error: null },
  {
    data: { user: { email: "unverified@example.com" } },
    error: { message: "Invalid session" },
  },
])("account rejects missing or invalid authentication", async (result) => {
  getUser.mockResolvedValue(result);
  await expect(AccountPage()).rejects.toThrow("REDIRECT:/auth");
});

test("signed-out visitors can sign in or sign up, but cannot see sign-out", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  const html = renderToStaticMarkup(await AuthPage());
  expect(html).toContain("Sign up or sign in");
  expect(html).toContain('name="email"');
  expect(html).toContain('name="password"');
  expect(html).not.toContain("Sign out");
});
