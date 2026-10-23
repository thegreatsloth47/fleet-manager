import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  maintenance: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/assets/access", () => ({
  authorizeVehicles: mocks.authorize,
}));
vi.mock("@/modules/maintenance/service", () => ({
  getMaintenance: mocks.maintenance,
}));
import { getServiceHistory, saveService } from "./service";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  asset = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input = {
  command_id: org,
  id: asset,
  expected_version: 0,
  action: "save",
  reason: null,
  service_date: "2020-01-01",
  title: "Inspection",
  provider: null,
  cost_cents: null,
  currency: "USD",
  notes: null,
  total_distance: null,
  schedule_ids: [],
};
let rows: Record<string, { data: unknown; error: unknown }>;
const scopes: Record<string, ReturnType<typeof vi.fn>> = {};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({
    status: 200,
    data: { supabase: { from: mocks.from, rpc: mocks.rpc }, canManage: true },
  });
  mocks.maintenance.mockResolvedValue({
    status: 200,
    data: { canManage: true, vehicleName: "Van", items: [] },
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  rows = {
    service_records: {
      data: [{ id: asset, total_distance: 100, service_date: "2020-01-01" }],
      error: null,
    },
    service_revisions: { data: [], error: null },
    service_schedule_effects: { data: [], error: null },
    meters: { data: { unit: "mi" }, error: null },
  };
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(rows[table]).then(resolve),
    };
    scopes[table] = query.eq;
    return query;
  });
});
test.each([401, 403, 404, 500])(
  "denied access %s stops all service operations",
  async (status) => {
    mocks.authorize.mockResolvedValue({ status, error: "Denied" });
    expect((await getServiceHistory(org, asset)).status).toBe(status);
    expect((await saveService(org, asset, input)).status).toBe(status);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
test("every read is scoped to organization and vehicle; mileage warnings preserve original values", async () => {
  mocks.rpc.mockResolvedValue({
    data: [{ id: asset, inconsistent: true }],
    error: null,
  });
  const result = await getServiceHistory(org, asset);
  expect(result.data?.records[0]).toMatchObject({
    total_distance: 100,
    mileage_inconsistent: true,
  });
  for (const table of Object.keys(rows)) {
    expect(scopes[table]).toHaveBeenCalledWith("organization_id", org);
    expect(scopes[table]).toHaveBeenCalledWith("asset_id", asset);
  }
  expect(mocks.rpc).toHaveBeenCalledWith("service_mileage_reviews", {
    target_organization_id: org,
    target_asset_id: asset,
  });
});
test("read-only and archived vehicle controls follow existing maintenance permissions", async () => {
  mocks.maintenance.mockResolvedValue({
    status: 200,
    data: { canManage: false, items: [] },
  });
  expect(
    (await getServiceHistory(org, asset)).data?.maintenance.canManage,
  ).toBe(false);
});
test("missing vehicle and malformed inputs stop before database commands", async () => {
  mocks.maintenance.mockResolvedValue({ status: 404, error: "Not found" });
  expect((await getServiceHistory(org, asset)).status).toBe(404);
  expect((await saveService(org, "invalid", input)).status).toBe(400);
  expect(
    (await saveService(org, asset, { ...input, organization_id: org })).status,
  ).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test("write authorization and a tenant-scoped atomic command are required", async () => {
  mocks.rpc.mockResolvedValue({ data: asset, error: null });
  expect((await saveService(org, asset, input)).status).toBe(201);
  expect(mocks.authorize).toHaveBeenCalledWith(org, true);
  expect(mocks.rpc).toHaveBeenCalledWith("save_service", {
    target_organization_id: org,
    target_asset_id: asset,
    payload: input,
  });
  expect(
    (
      await saveService(org, asset, {
        ...input,
        expected_version: 1,
        reason: "Fix title",
      })
    ).status,
  ).toBe(200);
});
test.each([
  ["PT409", 409],
  ["40001", 409],
  ["23505", 409],
  ["23514", 400],
  ["42501", 403],
  ["P0002", 404],
  ["55000", 409],
  ["XX000", 500],
])("maps database failure %s to %s", async (code, status) => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code } });
  expect((await saveService(org, asset, input)).status).toBe(status);
});
test("failed mileage review does not silently show history as consistent", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
  expect((await getServiceHistory(org, asset)).status).toBe(500);
});

test("PostgREST PT409 rejects a selected backdated effect without retrying or dropping schedules", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const backend = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: "PT409",
        message:
          "Backdated service cannot overwrite later maintenance; save without schedule effects",
        details: null,
        hint: null,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    ),
  );
  const client = createClient("https://fixture.invalid", "test-only-key", {
    global: { fetch: backend },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  mocks.rpc.mockImplementation((name, args) => client.rpc(name, args));
  const command = {
    ...input,
    service_date: "2020-01-15",
    total_distance: "10500",
    schedule_ids: [org],
  };
  const result = await saveService(org, asset, command);
  expect(result.status).toBe(409);
  expect(result.error).toContain("later service/manual change");
  expect(backend).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_service", {
    target_organization_id: org,
    target_asset_id: asset,
    payload: command,
  });
});
test("a gateway timeout remains a server error, never an invented business conflict", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "upstream request timeout" },
  });
  expect((await saveService(org, asset, input)).status).toBe(500);
});
