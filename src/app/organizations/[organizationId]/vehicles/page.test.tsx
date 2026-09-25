import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  access: vi.fn(),
  maintenance: vi.fn(),
}));
vi.mock("@/modules/maintenance/service", () => ({
  getMaintenance: mocks.maintenance,
}));
vi.mock("@/modules/assets/queries", () => ({ getVehicles: mocks.get }));
vi.mock("@/modules/assets/access", () => ({ authorizeVehicles: mocks.access }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("./vehicle-form", () => ({ default: () => <p>Vehicle editor</p> }));
vi.mock("./archive-button", () => ({
  default: () => <button>Archive vehicle</button>,
}));
import VehiclesPage from "./page";
import VehiclePage from "./[assetId]/page";
import NewVehiclePage from "./new/page";
const props = {
  params: Promise.resolve({ organizationId: "org-a", assetId: "asset-a" }),
  searchParams: Promise.resolve({}),
};
const vehicle = {
  id: "asset-a",
  name: "Van A",
  status: "active",
  archived_at: null,
  vin: "VIN-A",
  plate: "PLATE-A",
  make: "Ford",
  model: "Transit",
  year: 2024,
  jurisdiction: "MO",
  description: "Work van",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.maintenance.mockResolvedValue({ status: 200, data: { items: [] } });
  mocks.get.mockResolvedValue({
    status: 200,
    data: { vehicles: [vehicle], canManage: true },
  });
  mocks.access.mockResolvedValue({ status: 200, data: { canManage: true } });
});
test("owners can navigate the list, inspect details, edit and archive", async () => {
  const list = renderToStaticMarkup(await VehiclesPage(props));
  expect(list).toContain("Add vehicle");
  expect(list).toContain("/organizations/org-a/vehicles/asset-a");
  const detail = renderToStaticMarkup(await VehiclePage(props));
  for (const value of [
    "VIN-A",
    "PLATE-A",
    "Ford",
    "Transit",
    "2024",
    "MO",
    "Work van",
    "Vehicle editor",
    "Archive vehicle",
  ])
    expect(detail).toContain(value);
  expect(renderToStaticMarkup(await NewVehiclePage(props))).toContain(
    "Vehicle editor",
  );
});
test("read-only members see no write controls", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: { vehicles: [vehicle], canManage: false },
  });
  expect(renderToStaticMarkup(await VehiclesPage(props))).not.toContain(
    "Add vehicle",
  );
  const detail = renderToStaticMarkup(await VehiclePage(props));
  expect(detail).toContain("VIN-A");
  expect(detail).toContain("Manage or view maintenance");
  expect(detail).not.toContain("Vehicle editor");
  expect(detail).not.toContain("Archive vehicle");
  mocks.access.mockResolvedValue({ status: 403, error: "Access denied" });
  await expect(NewVehiclePage(props)).rejects.toThrow("NOT_FOUND");
});
test("archived vehicles remain visible and read-only for owners", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: {
      vehicles: [{ ...vehicle, archived_at: "2026-09-22" }],
      canManage: true,
    },
  });
  const detail = renderToStaticMarkup(await VehiclePage(props));
  expect(detail).toContain("Archived — read-only");
  expect(detail).toContain("VIN-A");
  expect(detail).toContain("Manage or view maintenance");
  expect(detail).not.toContain("Vehicle editor");
  expect(detail).not.toContain("Archive vehicle");
});
test("signed-out users redirect and inaccessible tenants or vehicles return not found", async () => {
  for (const page of [VehiclesPage, VehiclePage]) {
    mocks.get.mockResolvedValue({
      status: 401,
      error: "Authentication required",
    });
    await expect(page(props)).rejects.toThrow("REDIRECT:/auth");
    mocks.get.mockResolvedValue({ status: 404, error: "Not found" });
    await expect(page(props)).rejects.toThrow("NOT_FOUND");
  }
});
test("empty and failed queries have visible states", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: { vehicles: [], canManage: true },
  });
  expect(renderToStaticMarkup(await VehiclesPage(props))).toContain(
    "No vehicles yet.",
  );
  mocks.get.mockResolvedValue({
    status: 500,
    error: "Unable to load vehicles.",
  });
  expect(renderToStaticMarkup(await VehiclesPage(props))).toContain(
    'role="alert"',
  );
});
