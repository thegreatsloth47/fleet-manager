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
          page: "maintenance",
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

test.each([true, false])(
  "setup links point directly to the relevant page (can manage: %s)",
  async (canManage) => {
    mocks.query.mockResolvedValue({
      status: 200,
      data: {
        alerts: [],
        today: "2026-09-24",
        organizationName: "Acme Fleet",
        canManage,
        warnings: [
          {
            assetId: "van",
            page: "mileage",
            name: "Van A",
            message: "Record starting mileage.",
          },
          {
            assetId: "van",
            page: "maintenance",
            name: "Van A",
            message: "No maintenance schedules assigned.",
          },
        ],
      },
    });
    const html = renderToStaticMarkup(await DashboardPage({ params }));
    expect(html).toContain("Acme Fleet");
    expect(html).toContain(
      `href="/organizations/org/vehicles/van/mileage">Van A — ${canManage ? "Record starting mileage" : "View mileage"}</a>`,
    );
    expect(html).toContain(
      `href="/organizations/org/vehicles/van/maintenance">Van A — ${canManage ? "Add schedule" : "View maintenance schedules"}</a>`,
    );
  },
);
