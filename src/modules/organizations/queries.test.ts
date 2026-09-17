import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  membershipSelect: vi.fn(),
  membershipEq: vi.fn(),
  organizationSelect: vi.fn(),
  organizationIn: vi.fn(),
  organizationOrder: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

import { getAccessibleOrganizations } from "./queries";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-a" } },
    error: null,
  });
  mocks.from.mockImplementation((table: string) =>
    table === "memberships"
      ? { select: mocks.membershipSelect }
      : { select: mocks.organizationSelect },
  );
  mocks.membershipSelect.mockReturnValue({ eq: mocks.membershipEq });
  mocks.membershipEq
    .mockReturnValueOnce({ eq: mocks.membershipEq })
    .mockResolvedValueOnce({
      data: [{ organization_id: "organization-a" }],
      error: null,
    });
  mocks.organizationSelect.mockReturnValue({ in: mocks.organizationIn });
  mocks.organizationIn.mockReturnValue({ order: mocks.organizationOrder });
  mocks.organizationOrder.mockResolvedValue({
    data: [{ id: "organization-a", name: "A" }],
    error: null,
  });
});

test("requires a server-verified Auth user before any tenant query", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "Invalid token" },
  });
  expect((await getAccessibleOrganizations()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});

test("scopes queries using the verified user's active database memberships", async () => {
  expect((await getAccessibleOrganizations()).body).toEqual({
    organizations: [{ id: "organization-a", name: "A" }],
  });
  expect(mocks.membershipEq).toHaveBeenNthCalledWith(1, "user_id", "user-a");
  expect(mocks.membershipEq).toHaveBeenNthCalledWith(2, "status", "active");
  expect(mocks.organizationIn).toHaveBeenCalledWith("id", ["organization-a"]);
});

test("rejects a client-supplied foreign organization before reading it", async () => {
  expect((await getAccessibleOrganizations("organization-b")).status).toBe(404);
  expect(mocks.organizationSelect).not.toHaveBeenCalled();
});

test("allows an explicitly requested organization after membership validation", async () => {
  expect((await getAccessibleOrganizations("organization-a")).status).toBe(200);
  expect(mocks.organizationIn).toHaveBeenCalledWith("id", ["organization-a"]);
});

test("returns no organizations for an outsider or revoked user", async () => {
  mocks.membershipEq
    .mockReset()
    .mockReturnValueOnce({ eq: mocks.membershipEq })
    .mockResolvedValueOnce({ data: [], error: null });
  expect((await getAccessibleOrganizations()).body).toEqual({
    organizations: [],
  });
  expect(mocks.organizationSelect).not.toHaveBeenCalled();
});

test("fails closed on membership lookup errors without exposing database details", async () => {
  mocks.membershipEq
    .mockReset()
    .mockReturnValueOnce({ eq: mocks.membershipEq })
    .mockResolvedValueOnce({
      data: null,
      error: { message: "private database detail" },
    });
  expect(await getAccessibleOrganizations()).toEqual({
    status: 500,
    body: { error: "Unable to load organizations." },
  });
  expect(mocks.organizationSelect).not.toHaveBeenCalled();
});

test("handles membership revocation between the membership query and organization query", async () => {
  mocks.organizationOrder.mockResolvedValue({ data: [], error: null });
  expect((await getAccessibleOrganizations("organization-a")).status).toBe(404);
});

test("does not expose database errors from organization queries", async () => {
  mocks.organizationOrder.mockResolvedValue({
    data: null,
    error: { message: "private database detail" },
  });
  expect(await getAccessibleOrganizations()).toEqual({
    status: 500,
    body: { error: "Unable to load organizations." },
  });
});
