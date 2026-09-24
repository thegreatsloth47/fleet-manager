import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ vehicles: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/assets/queries", () => ({ getVehicles: mocks.vehicles }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
import { getMileage, recordMileage } from "./service";
const input = {
  command_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  action: "reading",
  observed_at: "2020-01-01T00:00:00Z",
  physical: "100",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.vehicles.mockResolvedValue({
    status: 200,
    data: { vehicles: [{ name: "Van", archived_at: null }], canManage: true },
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

test.each([400, 401, 404, 500])(
  "propagates vehicle authorization/validation failure %s without meter access",
  async (status) => {
    mocks.vehicles.mockResolvedValue({ status, error: "Denied" });
    expect((await getMileage("org", "asset")).status).toBe(status);
    expect((await recordMileage("org", "asset", input)).status).toBe(status);
    expect(mocks.vehicles).toHaveBeenCalledWith("org", { assetId: "asset" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

test("read-only membership can review history but cannot write", async () => {
  mocks.vehicles.mockResolvedValue({
    status: 200,
    data: { vehicles: [{ name: "Van", archived_at: null }], canManage: false },
  });
  expect((await getMileage("org", "asset")).data?.canManage).toBe(false);
  mocks.rpc.mockClear();
  expect((await recordMileage("org", "asset", input)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test("archived vehicles retain readable history and reject every mutation", async () => {
  mocks.vehicles.mockResolvedValue({
    status: 200,
    data: {
      vehicles: [{ name: "Van", archived_at: "2020-01-01" }],
      canManage: true,
    },
  });
  expect((await getMileage("org", "asset")).data?.canManage).toBe(false);
  mocks.rpc.mockClear();
  for (const action of [
    "baseline",
    "reading",
    "replacement",
    "correct",
    "void",
  ])
    expect(
      (await recordMileage("org", "asset", { ...input, action })).status,
    ).toBe(409);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test("authorized commands and history are explicitly scoped to the asset and organization", async () => {
  await getMileage("org-a", "asset-a");
  expect(mocks.rpc).toHaveBeenCalledWith("meter_history", {
    target_organization_id: "org-a",
    target_asset_id: "asset-a",
  });
  mocks.rpc.mockResolvedValue({ data: input.command_id, error: null });
  expect((await recordMileage("org-a", "asset-a", input)).status).toBe(201);
  expect(mocks.rpc).toHaveBeenLastCalledWith("record_meter_command", {
    target_organization_id: "org-a",
    target_asset_id: "asset-a",
    payload: input,
  });
});

test("invalid commands never reach database writes", async () => {
  expect(
    (await recordMileage("org", "asset", { ...input, physical: "-1" })).status,
  ).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test.each([
  ["42501", 403],
  ["P0002", 404],
  ["23505", 409],
  ["40001", 409],
  ["55000", 409],
  ["23514", 400],
  ["22023", 400],
  ["22P02", 400],
  ["22007", 400],
  ["unknown", 500],
])("maps %s safely", async (code, status) => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code, message: "Private SQL detail" },
  });
  const result = await recordMileage("org", "asset", input);
  expect(result.status).toBe(status);
  expect(result.error).not.toContain("Private");
});

test("query failures and empty write responses are reported", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect((await recordMileage("org", "asset", input)).status).toBe(500);
  expect((await getMileage("org", "asset")).status).toBe(500);
});
