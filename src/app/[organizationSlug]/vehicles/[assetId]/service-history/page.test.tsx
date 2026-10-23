vi.mock("@/modules/organizations/page-access", () => ({
  resolveOrganizationPage: async (slug: string) => slug,
}));
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { ServiceHistory } from "@/modules/service-history/service";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/modules/service-history/service", () => ({
  getServiceHistory: mocks.get,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import ServicePage from "./page";
const props = {
  params: Promise.resolve({ organizationSlug: "org", assetId: "vehicle" }),
};
const record = {
  id: "service",
  organization_id: "org",
  asset_id: "vehicle",
  asset_type: "vehicle",
  service_date: "2020-01-01",
  title: "Oil service",
  provider: "Local shop",
  cost_cents: 12345,
  currency: "USD",
  notes: "Keep original mileage",
  total_distance: 12000,
  distance_unit: "mi",
  schedule_ids: ["schedule"],
  voided: false,
  version: 1,
  updated_by: "owner",
  updated_at: "2020-01-02",
};
let history: ServiceHistory;
beforeEach(() => {
  vi.resetAllMocks();
  history = {
    records: [{ ...record, mileage_inconsistent: true }],
    revisions: [
      {
        id: "revision",
        organization_id: "org",
        asset_id: "vehicle",
        service_id: "service",
        version: 1,
        snapshot: record,
        reason: null,
        actor_id: "owner",
        recorded_at: "2020-01-02",
      },
    ],
    effects: [
      {
        id: "effect",
        organization_id: "org",
        asset_id: "vehicle",
        service_id: "service",
        revision_id: "revision",
        schedule_id: "schedule",
        schedule_name: "Oil",
        service_date: "2020-01-01",
        reversal_of: null,
        before_usage: 10000,
        after_usage: 13000,
        before_date: null,
        after_date: null,
        before_version: 1,
        after_version: 2,
        distance_interval: 1000,
        distance_unit: "mi",
        prior_updated_at: "2020-01-01",
        time_interval: null,
        time_unit: null,
      },
    ],
    maintenance: {
      templates: [],
      items: [],
      alerts: [],
      warnings: [],
      canManage: true,
      today: "2026-09-30",
      organizationName: "Org",
      vehicleName: "Van",
    },
    unit: "mi",
  };
  mocks.get.mockImplementation(async () => ({ status: 200, data: history }));
});
test("shows preserved mileage, review warning, money, and auditable schedule targets", async () => {
  const html = renderToStaticMarkup(await ServicePage(props));
  expect(mocks.get).toHaveBeenCalledWith("org", "vehicle");
  for (const text of [
    "Van",
    "Oil service",
    "Local shop",
    "$123.45 USD",
    "12000 mi",
    "Mileage needs review",
    "10000",
    "13000",
    "Interval: 1000",
    "User owner",
    "Edit service",
    "Void service",
  ])
    expect(html).toContain(text);
  expect(html).toContain('href="/org/vehicles/vehicle/maintenance"');
  expect(html).not.toContain("checked");
});
test("read-only and archived views retain audit and warnings without mutation controls", async () => {
  history.maintenance.canManage = false;
  const html = renderToStaticMarkup(await ServicePage(props));
  expect(html).toContain("Service history is read-only");
  expect(html).toContain("Mileage needs review");
  expect(html).toContain("Change history and schedule effects");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<button");
});
test("unknown mileage and cost stay explicit; voided records cannot be edited", async () => {
  history.records[0] = {
    ...history.records[0],
    total_distance: null,
    cost_cents: null,
    voided: true,
    mileage_inconsistent: false,
  };
  const html = renderToStaticMarkup(await ServicePage(props));
  expect(html).toContain("Total distance: Unknown");
  expect(html).toContain("Cost unknown");
  expect(html).toContain("— voided");
  expect(html).not.toContain(">Edit service</button>");
});
test("authentication and unavailable history have explicit error states", async () => {
  mocks.get.mockResolvedValue({ status: 401, error: "Sign in" });
  await expect(ServicePage(props)).rejects.toThrow("REDIRECT:/auth");
  mocks.get.mockResolvedValue({ status: 404, error: "Missing" });
  await expect(ServicePage(props)).rejects.toThrow("NOT_FOUND");
  mocks.get.mockResolvedValue({
    status: 500,
    error: "Unable to load service history.",
  });
  expect(renderToStaticMarkup(await ServicePage(props))).toContain(
    'role="alert"',
  );
});
