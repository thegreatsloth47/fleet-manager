import type { CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
import { proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

test("passes refreshed auth cookies to the downstream request and browser with private cache headers", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  const getUser = vi.fn();
  mocks.createServerClient.mockImplementation(
    (
      _url: string,
      _key: string,
      { cookies }: { cookies: CookieMethodsServer },
    ) => {
      getUser.mockImplementation(async () => {
        expect(await cookies.getAll()).toEqual([
          { name: "session", value: "expired" },
        ]);
        await cookies.setAll?.(
          [
            {
              name: "session",
              value: "refreshed",
              options: { path: "/", sameSite: "lax" },
            },
          ],
          {
            "Cache-Control": "private, no-store",
            Pragma: "no-cache",
            Expires: "0",
          },
        );
        return { data: { user: { id: "user-a" } }, error: null };
      });
      return { auth: { getUser } };
    },
  );

  const request = new NextRequest("http://localhost/api/organizations", {
    headers: { Cookie: "session=expired" },
  });
  const response = await proxy(request);

  expect(getUser).toHaveBeenCalledOnce();
  expect(request.cookies.get("session")?.value).toBe("refreshed");
  expect(response.headers.get("x-middleware-request-cookie")).toContain(
    "session=refreshed",
  );
  expect(response.cookies.get("session")?.value).toBe("refreshed");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(response.headers.get("Expires")).toBe("0");
});
