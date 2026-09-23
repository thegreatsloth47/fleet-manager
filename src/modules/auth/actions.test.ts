import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: mocks }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { authenticate, signOut } from "./actions";

function credentials(intent = "sign-in") {
  const form = new FormData();
  form.set("email", " person@example.com ");
  form.set("password", "correct-password");
  form.set("intent", intent);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test.each(["development", "production"])(
  "signup diagnostics in %s keep provider details out of the response",
  async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signUp.mockResolvedValue({
      data: { session: null },
      error: {
        code: "weak_password",
        message: "Password policy details from Supabase",
        details: "Additional provider data must not be logged",
      },
    });

    expect(await authenticate({}, credentials("sign-up"))).toEqual({
      error:
        "Unable to sign up. Check the password requirements and try again.",
    });
    if (environment === "development") {
      expect(log).toHaveBeenCalledExactlyOnceWith("Supabase signup failed", {
        code: "weak_password",
        message: "Password policy details from Supabase",
      });
    } else {
      expect(log).not.toHaveBeenCalled();
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  },
);

test("signup awaits email confirmation without claiming a session", async () => {
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  expect(await authenticate({}, credentials("sign-up"))).toEqual({
    message: "Check your email for a confirmation link, then sign in.",
  });
  expect(mocks.signUp).toHaveBeenCalledWith({
    email: "person@example.com",
    password: "correct-password",
  });
  expect(mocks.redirect).not.toHaveBeenCalled();
});

test.each(["sign-up", "sign-in"])(
  "%s with an issued session opens organizations",
  async (intent) => {
    mocks.signUp.mockResolvedValue({
      data: { session: { access_token: "verified" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "verified" } },
      error: null,
    });
    await expect(authenticate({}, credentials(intent))).rejects.toThrow(
      "REDIRECT:/organizations",
    );
  },
);

test("failed sign-in exposes no provider details and does not redirect", async () => {
  mocks.signInWithPassword.mockResolvedValue({
    data: { session: null },
    error: { message: "sensitive provider detail" },
  });
  expect(await authenticate({}, credentials())).toEqual({
    error: "Sign-in failed. Check your credentials and confirm your email.",
  });
  expect(mocks.redirect).not.toHaveBeenCalled();
});

test("rejects malformed credentials before calling Auth", async () => {
  expect(await authenticate({}, new FormData())).toEqual({
    error: "Enter a valid email and password.",
  });
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(mocks.signInWithPassword).not.toHaveBeenCalled();
});

test("successful sign-out clears the session through Supabase and redirects", async () => {
  mocks.signOut.mockResolvedValue({ error: null });
  await expect(signOut()).rejects.toThrow("REDIRECT:/auth");
  expect(mocks.signOut).toHaveBeenCalledOnce();
});

test("failed sign-out remains visible", async () => {
  mocks.signOut.mockResolvedValue({ error: { message: "network" } });
  expect(await signOut()).toEqual({
    error: "Unable to sign out. Please try again.",
  });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
