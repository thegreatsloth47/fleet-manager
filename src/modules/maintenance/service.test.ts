import { beforeEach, expect, test, vi } from "vitest";
import { defaultRule } from "./maintenance";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/assets/access", () => ({
  authorizeVehicles: mocks.authorize,
}));
import { getMaintenance, saveMaintenance } from "./service";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const asset = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input = {
  ...defaultRule,
  id: org,
  expected_version: 0,
  name: "Oil",
  distance_interval: 1000,
  distance_unit: "mi",
  enabled: true,
};
const template = { ...input, version: 1, organization_id: org };
let rows: Record<string, { data: unknown; error: unknown }>;
const queries: Record<string, { eq: ReturnType<typeof vi.fn> }> = {};
beforeEach(() => {
  vi.resetAllMocks();
  rows = {
    maintenance_templates: { data: [template], error: null },
    maintenance_assignments: { data: [], error: null },
    assets: {
      data: [{ id: asset, name: "Van", archived_at: null }],
      error: null,
    },
    organizations: { data: { timezone: "America/Chicago" }, error: null },
  };
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(rows[table]).then(resolve),
    };
    queries[table] = query;
    return query;
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.authorize.mockResolvedValue({
    status: 200,
    data: { supabase: { from: mocks.from, rpc: mocks.rpc }, canManage: true },
  });
});
test.each([401, 403, 404, 500])(
  "authorization failure %s prevents all maintenance access",
  async (status) => {
    mocks.authorize.mockResolvedValue({ status, error: "Denied" });
    expect((await getMaintenance(org)).status).toBe(status);
    expect((await saveMaintenance(org, null, input)).status).toBe(status);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
test("write authorization is requested and validated input is tenant scoped", async () => {
  mocks.rpc.mockResolvedValue({ data: org, error: null });
  expect((await saveMaintenance(org, null, input)).status).toBe(201);
  expect(mocks.authorize).toHaveBeenCalledWith(org, true);
  expect(mocks.rpc).toHaveBeenCalledWith("save_maintenance", {
    target_organization_id: org,
    target_asset_id: null,
    payload: input,
  });
});
test("rejects malformed inputs before RPC", async () => {
  expect(
    (await saveMaintenance(org, null, { ...input, due_percent: 101 })).status,
  ).toBe(400);
  expect((await saveMaintenance(org, "invalid", input)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test("dashboard scopes every query, flags setup gaps, and rejects missing vehicles", async () => {
  const result = await getMaintenance(org);
  expect(result.data?.warnings).toHaveLength(2);
  for (const query of Object.values(queries))
    expect(query.eq).toHaveBeenCalledWith(
      expect.stringMatching(/organization_id|id/),
      org,
    );
  expect(mocks.rpc).toHaveBeenCalledWith("maintenance_usage", {
    target_organization_id: org,
  });
  expect((await getMaintenance(org, org)).status).toBe(404);
});
test("dashboard orders actionable items and excludes archived, paused and disabled schedules", async () => {
  rows.maintenance_templates.data = [
    template,
    { ...template, id: "disabled", enabled: false },
  ];
  rows.assets.data = [
    { id: asset, name: "Van", archived_at: null },
    { id: "archived", name: "Historical", archived_at: "2026-01-01" },
  ];
  const base = {
    ...template,
    asset_id: asset,
    template_id: org,
    next_due_usage: 10000,
    paused: false,
    next_due_date: null,
  };
  rows.maintenance_assignments.data = [
    { ...base, id: "upcoming", next_due_usage: 10080 },
    { ...base, id: "due", next_due_usage: 10040 },
    { ...base, id: "overdue", next_due_usage: 9999 },
    { ...base, id: "paused", paused: true },
    { ...base, id: "disabled", template_id: "disabled" },
    { ...base, id: "archived", asset_id: "archived" },
    { ...base, id: "later", next_due_usage: 12000 },
  ];
  mocks.rpc.mockResolvedValue({
    data: [
      { asset_id: asset, accumulated: "10000", observed_at: "2026-01-01" },
    ],
    error: null,
  });
  const result = await getMaintenance(org);
  expect(result.data?.alerts.map((i) => i.id)).toEqual([
    "overdue",
    "due",
    "upcoming",
  ]);
  expect(result.data?.items).toHaveLength(7);
  expect(result.data?.warnings).toEqual([]);
});
test("archived vehicle pages are read-only; query failures do not become empty healthy dashboards", async () => {
  rows.assets.data = [{ id: asset, name: "Van", archived_at: "2026-01-01" }];
  expect((await getMaintenance(org, asset)).data?.canManage).toBe(false);
  rows.maintenance_assignments = { data: null, error: { message: "Private" } };
  expect((await getMaintenance(org)).status).toBe(500);
});
test.each([
  ["42501", 403],
  ["P0002", 404],
  ["23505", 409],
  ["40001", 409],
  ["55000", 409],
  ["23514", 400],
  ["22008", 400],
  ["unknown", 500],
])("maps %s safely", async (code, status) => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code, message: "Private SQL" },
  });
  const result = await saveMaintenance(org, null, input);
  expect(result.status).toBe(status);
  expect(result.error).not.toContain("Private");
});
