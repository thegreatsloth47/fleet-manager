import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ maintenance: vi.fn(), vehicles: vi.fn() }));
vi.mock("@/modules/maintenance/service", () => ({
  getMaintenance: mocks.maintenance,
}));
vi.mock("@/modules/assets/queries", () => ({ getVehicles: mocks.vehicles }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import MaintenancePage from "./page";
import VehicleMaintenancePage from "../vehicles/[assetId]/maintenance/page";
const params = Promise.resolve({ organizationId: "org", assetId: "van" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.maintenance.mockResolvedValue({
    status: 200,
    data: {
      templates: [],
      items: [],
      warnings: [],
      canManage: true,
      organizationName: "Acme Fleet",
      vehicleName: "Van A",
    },
  });
  mocks.vehicles.mockResolvedValue({
    status: 200,
    data: { vehicles: [{ id: "van", name: "Van A" }] },
  });
});
test("templates retain vehicle context only through the authorized vehicle query", async () => {
  const html = renderToStaticMarkup(
    await MaintenancePage({
      params,
      searchParams: Promise.resolve({ vehicle: "van" }),
    }),
  );
  expect(mocks.vehicles).toHaveBeenCalledWith("org", { assetId: "van" });
  expect(html).toContain('href="/organizations/org/vehicles/van/maintenance"');
  expect(html).toContain("Back to Van A maintenance");
  expect(html).toContain("Acme Fleet");
  expect(html).toContain('id="new-template"');
});
test.each([400, 404])(
  "invalid or inaccessible vehicle context returns not found (%s)",
  async (status) => {
    mocks.vehicles.mockResolvedValue({ status });
    await expect(
      MaintenancePage({
        params,
        searchParams: Promise.resolve({ vehicle: "foreign" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  },
);
test("organization templates need no vehicle context", async () => {
  const html = renderToStaticMarkup(await MaintenancePage({ params }));
  expect(mocks.vehicles).not.toHaveBeenCalled();
  expect(html).not.toContain("Back to");
});
test("empty vehicle schedules link directly to template creation and related pages", async () => {
  const html = renderToStaticMarkup(await VehicleMaintenancePage({ params }));
  expect(html).toContain("Van A — Maintenance schedules");
  expect(html).toContain(
    'href="/organizations/org/maintenance?vehicle=van#new-template"',
  );
  expect(html).toContain('href="/organizations/org/vehicles/van/mileage"');
  expect(html).toContain('href="/organizations/org/dashboard"');
  mocks.maintenance.mockResolvedValue({
    status: 200,
    data: {
      templates: [],
      items: [],
      warnings: [],
      canManage: false,
      vehicleName: "Van A",
    },
  });
  const readOnly = renderToStaticMarkup(
    await VehicleMaintenancePage({ params }),
  );
  expect(readOnly).not.toContain("Create a maintenance template");
  expect(readOnly).not.toContain("<form");
});
