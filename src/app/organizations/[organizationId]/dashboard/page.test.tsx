import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/modules/maintenance/service", () => ({
  getMaintenance: mocks.query,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import DashboardPage from "./page";
const params = Promise.resolve({ organizationId: "org" });
beforeEach(() => vi.resetAllMocks());
test("signed-out and unauthorized visitors cannot render dashboard data", async () => {
  mocks.query.mockResolvedValue({ status: 401 });
  await expect(DashboardPage({ params })).rejects.toThrow("REDIRECT:/auth");
  mocks.query.mockResolvedValue({ status: 404 });
  await expect(DashboardPage({ params })).rejects.toThrow("NOT_FOUND");
});
test("load failures never claim maintenance is healthy", async () => {
  mocks.query.mockResolvedValue({
    status: 500,
    error: "Unable to load maintenance.",
  });
  const html = renderToStaticMarkup(await DashboardPage({ params }));
  expect(html).toContain('role="alert"');
  expect(html).not.toContain("No active maintenance alerts.");
});
test("an empty attention list still displays actionable setup gaps", async () => {
  mocks.query.mockResolvedValue({
    status: 200,
    data: {
      alerts: [],
      today: "2026-09-24",
      warnings: [
        {
          assetId: "vehicle",
          name: "Van",
          message: "No maintenance schedules assigned.",
        },
      ],
    },
  });
  const html = renderToStaticMarkup(await DashboardPage({ params }));
  expect(html).toContain("No active maintenance alerts.");
  expect(html).toContain("Finish setup");
  expect(html).toContain("/organizations/org/vehicles/vehicle/maintenance");
});
