import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));
import { createOrganization } from "./commands";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "verified-user" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: "organization-id", error: null });
});

test("requires verified authentication before creating an organization", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "expired" },
  });
  expect((await createOrganization({ name: "Team" })).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test("sends only the normalized name to the atomic database operation", async () => {
  expect(await createOrganization({ name: " Team " })).toEqual({
    status: 201,
    body: { organization: { id: "organization-id" } },
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_organization", {
    organization_name: "Team",
  });
});

test.each([
  null,
  [],
  {},
  { name: 123 },
  { name: "  " },
  { name: "x".repeat(201) },
  { name: "Team", user_id: "victim" },
  { name: "Team", role: "owner" },
  { name: "Team", organization_id: "foreign" },
])(
  "rejects malformed input and client-controlled authorization fields: %j",
  async (input) => {
    expect((await createOrganization(input)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

test("does not leak database errors or report success on failed creation", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "private details" },
  });
  expect(await createOrganization({ name: "Team" })).toEqual({
    status: 500,
    body: { error: "Unable to create organization." },
  });
});
