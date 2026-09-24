import { afterEach, expect, test, vi } from "vitest";
import { getSupabaseEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());

test("reads the public Supabase configuration", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  expect(getSupabaseEnvironment()).toEqual({
    url: "http://127.0.0.1:54321",
    publishableKey: "sb_publishable_test",
  });
});

test.each([undefined, "", "   "])("rejects missing key: %s", (key) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
  expect(getSupabaseEnvironment).toThrow("Set NEXT_PUBLIC_SUPABASE_URL");
});

test.each(["invalid", "file:///tmp/supabase", "javascript:alert(1)"])(
  "rejects invalid URL: %s",
  (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(getSupabaseEnvironment).toThrow("valid HTTP(S) URL");
  },
);

test("rejects a secret key in public configuration without including it in the error", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_do_not_expose");
  expect(getSupabaseEnvironment).toThrow("must be a Supabase publishable key");
  expect(getSupabaseEnvironment).not.toThrow("sb_secret_do_not_expose");
});
