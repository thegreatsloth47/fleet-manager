import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/modules/meters/service", () => ({ getMileage: mocks.get }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import MileagePage from "./page";
const props = {
  params: Promise.resolve({ organizationId: "org", assetId: "asset" }),
};
const entry = {
  id: "entry",
  revision_id: "revision",
  kind: "replacement",
  unit: "mi",
  observed_at: "2020-01-02T00:00:00+00:00",
  physical: "10",
  old_final: "200",
  baseline_usage: null,
  accumulated: "200",
  voided: false,
  audit: JSON.stringify({
    original: {
      physical: "0",
      old_final: "200",
      reason: "Broken",
      actor: "owner",
    },
    revisions: [
      {
        physical: "10",
        old_final: "200",
        reason: "Starting value typo",
        actor: "admin",
        voided: false,
      },
    ],
  }),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({
    status: 200,
    data: { history: [entry], canManage: true, vehicleName: "Van A" },
  });
});
test("shows separate physical and accumulated values and original/corrected evidence", async () => {
  const html = renderToStaticMarkup(await MileagePage(props));
  expect(mocks.get).toHaveBeenCalledWith("org", "asset");
  for (const text of [
    "Van A",
    "Physical odometer",
    "10 mi",
    "Accumulated usage",
    "200 mi",
    "Broken",
    "Starting value typo",
    "Original entry",
    "Correction",
    "Replace/reset odometer",
    "Add reading",
    "Correct",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain(">Void</button>");
});
test("empty history offers initialization and explicit unit selection", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: { history: [], canManage: true, vehicleName: "Van A" },
  });
  const html = renderToStaticMarkup(await MileagePage(props));
  for (const text of [
    "No mileage recorded yet",
    "Initial mileage",
    "Miles",
    "Kilometers",
    "Declared accumulated usage",
  ])
    expect(html).toContain(text);
});
test("read-only and archived access retain history without mutation controls", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: { history: [entry], canManage: false, vehicleName: "Van A" },
  });
  const html = renderToStaticMarkup(await MileagePage(props));
  expect(html).toContain("Mileage is read-only");
  expect(html).toContain("Original entry and audit history");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<button");
});
test("voided latest entry never becomes the current reading", async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: {
      history: [
        entry,
        {
          ...entry,
          id: "void",
          kind: "reading",
          physical: "999",
          accumulated: "1189",
          voided: true,
        },
      ],
      canManage: true,
      vehicleName: "Van A",
    },
  });
  const html = renderToStaticMarkup(await MileagePage(props));
  expect(html).toContain("<dd>10 mi</dd>");
  expect(html).not.toContain("<dd>999 mi</dd>");
  expect(html).toContain("voided");
  expect(html).toContain("Correct and restore");
});
test("authentication, missing resources and load errors have explicit states", async () => {
  mocks.get.mockResolvedValue({ status: 401, error: "Sign in" });
  await expect(MileagePage(props)).rejects.toThrow("REDIRECT:/auth");
  mocks.get.mockResolvedValue({ status: 404, error: "Not found" });
  await expect(MileagePage(props)).rejects.toThrow("NOT_FOUND");
  mocks.get.mockResolvedValue({
    status: 500,
    error: "Unable to load mileage history.",
  });
  expect(renderToStaticMarkup(await MileagePage(props))).toContain(
    'role="alert"',
  );
});
