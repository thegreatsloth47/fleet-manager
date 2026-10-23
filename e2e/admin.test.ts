import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  rename: vi.fn(),
}));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  readFileSync: mocks.read,
  writeFileSync: mocks.write,
  renameSync: mocks.rename,
}));
vi.mock("./environment.mjs", () => ({
  configuration: () => ({
    project: "abcdefghijklmnopqrst",
    url: "https://abcdefghijklmnopqrst.supabase.co",
    adminKey: "test-only",
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: mocks.from,
    auth: {
      admin: { getUserById: mocks.getUser, deleteUser: mocks.deleteUser },
    },
  }),
}));
import { Fixtures } from "./admin";
const id = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const runId = id(1),
  fixtureId = id(2),
  userId = id(3),
  orgId = id(4),
  assetId = id(5);
const prefix = `ff-e2e-${runId}-${fixtureId}`;
const email = `ff-e2e-${runId.slice(0, 8)}-${fixtureId.slice(0, 8)}-owner@example.com`;
const path = "/tmp/mock-recovery.json";
let files: Record<string, string>;
let rows: Record<string, Record<string, unknown>[]>;
let failedTable: string | undefined;
const deletes: { table: string; filters: [string, unknown][] }[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  failedTable = undefined;
  deletes.length = 0;
  files = {
    [path]: JSON.stringify(
      {
        version: 1,
        project: "abcdefghijklmnopqrst",
        runId,
        fixtureId,
        users: [{ id: userId, email }],
        organizations: [
          { id: orgId, name: `${prefix}-organization`, ownerId: userId },
        ],
        cleaned: false,
      },
      null,
      2,
    ),
  };
  mocks.read.mockImplementation((name: string) => files[name]);
  mocks.write.mockImplementation((name: string, value: string) => {
    files[name] = value;
  });
  mocks.rename.mockImplementation((source: string, target: string) => {
    files[target] = files[source];
  });
  mocks.getUser.mockImplementation(async (requested: string) =>
    requested === userId
      ? {
          data: {
            user: {
              email,
              app_metadata: {
                fleetfalcon_e2e_run: runId,
                fleetfalcon_e2e_fixture: fixtureId,
              },
            },
          },
          error: null,
        }
      : { data: { user: null }, error: { status: 404 } },
  );
  mocks.deleteUser.mockResolvedValue({ error: null });
  rows = {
    organizations: [{ id: orgId, name: `${prefix}-organization` }],
    memberships: [{ organization_id: orgId, user_id: userId, role: "owner" }],
    assets: [{ id: assetId, name: `${prefix}-vehicle` }],
    vehicle_profiles: [{ asset_id: assetId }],
    meters: [{ id: id(6), asset_id: assetId }],
    meter_entries: [{ id: id(7), meter_id: id(6), actor_id: userId }],
    meter_revisions: [{ id: id(8), meter_id: id(6), actor_id: userId }],
    maintenance_templates: [{ id: id(9), updated_by: userId }],
    maintenance_assignments: [
      { id: id(10), asset_id: assetId, template_id: id(9), updated_by: userId },
    ],
    service_records: [{ id: id(11), asset_id: assetId, updated_by: userId }],
    service_revisions: [
      { id: id(12), asset_id: assetId, service_id: id(11), actor_id: userId },
    ],
    service_schedule_effects: [
      {
        id: id(13),
        asset_id: assetId,
        service_id: id(11),
        revision_id: id(12),
        schedule_id: id(10),
      },
    ],
  };
  mocks.from.mockImplementation((table: string) => {
    let deleting = false,
      preflight = false;
    const filters: [string, unknown][] = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      in: (key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      },
      limit: () => {
        preflight = true;
        return query;
      },
      delete: () => {
        deleting = true;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (deleting) {
          deletes.push({ table, filters });
          if (table === failedTable)
            return Promise.resolve({
              data: null,
              error: {
                code: "23503",
                message:
                  'update or delete on table "assets" violates foreign key constraint "example_asset_fkey" on table "example_dependency"',
              },
            }).then(resolve);
          rows[table] = [];
        }
        return Promise.resolve({
          data: preflight ? [] : rows[table],
          error: null,
        }).then(resolve);
      },
    };
    return query;
  });
});
test("service dependencies are deleted before schedules, meters and assets, using exact IDs and tenant scopes", async () => {
  await new Fixtures(runId, path).cleanup();
  expect(deletes.map((d) => d.table)).toEqual([
    "service_schedule_effects",
    "service_revisions",
    "service_records",
    "maintenance_assignments",
    "maintenance_templates",
    "meter_revisions",
    "meter_entries",
    "meters",
    "vehicle_profiles",
    "assets",
    "memberships",
    "organizations",
  ]);
  for (const deletion of deletes.slice(0, 10)) {
    expect(deletion.filters).toContainEqual(["organization_id", [orgId]]);
    expect(
      deletion.filters.some(
        ([key, ids]) =>
          ["id", "asset_id"].includes(key) &&
          Array.isArray(ids) &&
          ids.length === 1,
      ),
    ).toBe(true);
  }
  expect(JSON.parse(files[path]).cleaned).toBe(true);
});
test("asset failure reports the database code and dependency, preserves the recovery plan, and safely resumes", async () => {
  failedTable = "assets";
  await expect(new Fixtures(runId, path).cleanup()).rejects.toThrow(
    'Asset cleanup failed; retain manifest. Database error 23503: update or delete on table "assets" violates foreign key constraint "example_asset_fkey" on table "example_dependency"',
  );
  const failed = JSON.parse(files[path]);
  expect(failed.cleaned).toBe(false);
  expect(failed.deletionPlan.serviceEffectIds).toEqual([id(13)]);
  expect(failed.deletionPlan.assetIds).toEqual([assetId]);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
  expect(rows.memberships).toHaveLength(1);
  failedTable = undefined;
  await new Fixtures(runId, path).cleanup();
  const recovered = JSON.parse(files[path]);
  expect(recovered.deletionPlan).toEqual(failed.deletionPlan);
  expect(recovered.cleaned).toBe(true);
});
test("unexpected audit actor stops cleanup before any deletion", async () => {
  rows.service_revisions[0].actor_id = id(99);
  await expect(new Fixtures(runId, path).cleanup()).rejects.toThrow(
    "Unexpected service history",
  );
  expect(deletes).toEqual([]);
  expect(JSON.parse(files[path]).cleaned).toBe(false);
});
test("new rows after a failed cleanup are not swept into its original deletion plan", async () => {
  failedTable = "assets";
  await expect(new Fixtures(runId, path).cleanup()).rejects.toThrow(
    "Asset cleanup failed",
  );
  const original = JSON.parse(files[path]).deletionPlan;
  rows.assets.push({ id: id(99), name: `${prefix}-later-vehicle` });
  deletes.length = 0;
  await expect(new Fixtures(runId, path).cleanup()).rejects.toThrow(
    "Fixture changed after cleanup started",
  );
  expect(deletes).toEqual([]);
  expect(JSON.parse(files[path]).deletionPlan).toEqual(original);
});
