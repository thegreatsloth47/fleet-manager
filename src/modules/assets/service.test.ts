import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  membership: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
  assets: {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
import { saveVehicle, archiveVehicle } from "./commands";
import { getVehicles } from "./queries";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const asset = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-a" } },
    error: null,
  });
  mocks.from.mockImplementation((table: string) =>
    table === "memberships" ? mocks.membership : mocks.assets,
  );
  mocks.membership.select.mockReturnValue(mocks.membership);
  mocks.membership.eq.mockReturnValue(mocks.membership);
  mocks.membership.maybeSingle.mockResolvedValue({
    data: { role: "owner" },
    error: null,
  });
  for (const key of ["select", "eq", "is", "not"] as const)
    mocks.assets[key].mockReturnValue(mocks.assets);
  mocks.assets.order.mockResolvedValue({
    data: [
      {
        id: asset,
        organization_id: org,
        name: "Van",
        status: "active",
        make: null,
        model: null,
        year: null,
        description: null,
        archived_at: null,
        vehicle_profiles: { vin: null, plate: null, jurisdiction: null },
      },
    ],
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: asset, error: null });
});

test("all commands and reads verify the authenticated user", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await getVehicles(org)).status).toBe(401);
  expect((await saveVehicle(org, null, { name: "Van" })).status).toBe(401);
  expect((await archiveVehicle(org, asset)).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test.each([null, { role: "driver" }, { role: "unknown" }])(
  "denies outsiders, revoked membership and drivers before asset access: %j",
  async (membership) => {
    mocks.membership.maybeSingle.mockResolvedValue({
      data: membership,
      error: null,
    });
    expect((await getVehicles(org)).status).toBe(404);
    expect((await saveVehicle(org, null, { name: "Van" })).status).toBe(404);
    expect((await archiveVehicle(org, asset)).status).toBe(404);
    expect(mocks.assets.select).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

test("read-only membership permits reads but denies every write", async () => {
  mocks.membership.maybeSingle.mockResolvedValue({
    data: { role: "read_only" },
    error: null,
  });
  expect((await getVehicles(org)).data?.canManage).toBe(false);
  expect((await saveVehicle(org, null, { name: "Van" })).status).toBe(403);
  expect((await saveVehicle(org, asset, { name: "Van" })).status).toBe(403);
  expect((await archiveVehicle(org, asset)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test.each(["owner", "admin"])(
  "%s can create, edit and archive through atomic commands",
  async (role) => {
    mocks.membership.maybeSingle.mockResolvedValue({
      data: { role },
      error: null,
    });
    expect(
      (await saveVehicle(org, null, { name: " Van ", vin: " abc " })).status,
    ).toBe(201);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "save_vehicle",
      expect.objectContaining({
        target_organization_id: org,
        target_asset_id: null,
        vehicle_name: "Van",
        vehicle_vin: "ABC",
      }),
    );
    expect((await saveVehicle(org, asset, { name: "Truck" })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "save_vehicle",
      expect.objectContaining({ target_asset_id: asset }),
    );
    expect((await archiveVehicle(org, asset)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("archive_vehicle", {
      target_organization_id: org,
      target_asset_id: asset,
    });
  },
);

test("membership and vehicle queries explicitly scope the tenant and current user", async () => {
  const result = await getVehicles(org);
  expect(mocks.membership.eq.mock.calls).toEqual([
    ["organization_id", org],
    ["user_id", "user-a"],
    ["status", "active"],
  ]);
  expect(mocks.assets.eq).toHaveBeenCalledWith("organization_id", org);
  expect(mocks.assets.eq).toHaveBeenCalledWith("asset_type", "vehicle");
  expect(mocks.assets.is).toHaveBeenCalledWith("archived_at", null);
  expect(result.data?.vehicles[0]).toMatchObject({ name: "Van", vin: null });
  expect(result.data?.canManage).toBe(true);
});

test("archived lists are filtered; detail reads include archived records", async () => {
  await getVehicles(org, { archived: true });
  expect(mocks.assets.not).toHaveBeenCalledWith("archived_at", "is", null);
  mocks.assets.not.mockClear();
  await getVehicles(org, { assetId: asset });
  expect(mocks.assets.eq).toHaveBeenCalledWith("id", asset);
  expect(mocks.assets.is).not.toHaveBeenCalled();
  expect(mocks.assets.not).not.toHaveBeenCalled();
});

test("foreign and missing assets produce the same response", async () => {
  mocks.assets.order.mockResolvedValue({ data: [], error: null });
  expect(await getVehicles(org, { assetId: asset })).toEqual({
    status: 404,
    error: "Vehicle not found.",
  });
});

test("fails closed on membership errors", async () => {
  mocks.membership.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "private" },
  });
  expect((await saveVehicle(org, null, { name: "Van" })).status).toBe(500);
  expect((await getVehicles(org)).error).not.toContain("private");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test.each([
  ["23505", 409],
  ["55000", 409],
  ["P0002", 404],
  ["42501", 403],
  ["23514", 400],
  ["unexpected", 500],
])(
  "maps database error %s without exposing internal details",
  async (code, status) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "private detail" },
    });
    const result = await saveVehicle(org, asset, { name: "Van" });
    expect(result.status).toBe(status);
    expect(result.error).not.toContain("private");
  },
);

test("rejects malformed IDs and invalid payloads without writing", async () => {
  expect((await getVehicles("bad")).status).toBe(400);
  expect((await getVehicles(org, { assetId: "bad" })).status).toBe(400);
  expect((await saveVehicle(org, "bad", { name: "Van" })).status).toBe(400);
  expect(
    (await saveVehicle(org, null, { name: "Van", organization_id: "foreign" }))
      .status,
  ).toBe(400);
  expect((await archiveVehicle(org, "bad")).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
