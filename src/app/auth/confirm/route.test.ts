import { beforeEach, expect, test, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));
import { GET } from "./route";

beforeEach(() => verifyOtp.mockReset());

test("verifies the confirmation token and uses a fixed safe redirect", async () => {
  verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(
    new Request(
      "http://localhost/auth/confirm?token_hash=token&type=email&next=https://attacker.example",
    ),
  );
  expect(verifyOtp).toHaveBeenCalledWith({
    token_hash: "token",
    type: "email",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe(
    "http://localhost/organizations",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

test.each(["", "?token_hash=token&type=recovery", "?type=email"])(
  "rejects malformed confirmation links: %s",
  async (query) => {
    expect(
      (await GET(new Request(`http://localhost/auth/confirm${query}`))).status,
    ).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  },
);

test("expired or reused tokens do not open organizations", async () => {
  verifyOtp.mockResolvedValue({ error: { message: "expired" } });
  const response = await GET(
    new Request("http://localhost/auth/confirm?token_hash=expired&type=email"),
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("Location")).toBeNull();
});
