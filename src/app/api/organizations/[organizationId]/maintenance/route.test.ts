import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/modules/maintenance/service", () => ({
  getMaintenance: mocks.get,
  saveMaintenance: mocks.save,
}));
import { GET, POST } from "./route";
import {
  GET as vehicleGET,
  POST as vehiclePOST,
} from "../vehicles/[assetId]/maintenance/route";
const context = {
  params: Promise.resolve({ organizationId: "org", assetId: "asset" }),
};
const origin = "http://localhost:3000";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ status: 200, data: { alerts: [] } });
  mocks.save.mockResolvedValue({ status: 201, data: { id: "saved" } });
});
test("template and vehicle reads are scoped and never publicly cached", async () => {
  const response = await GET(new Request(origin), context);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.get).toHaveBeenCalledWith("org");
  await vehicleGET(new Request(origin), context);
  expect(mocks.get).toHaveBeenLastCalledWith("org", "asset");
});
test("template and schedule writes carry the route scope", async () => {
  const request = () =>
    new Request(origin, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Oil" }),
    });
  expect((await POST(request(), context)).status).toBe(201);
  expect(mocks.save).toHaveBeenCalledWith("org", null, { name: "Oil" });
  await vehiclePOST(request(), context);
  expect(mocks.save).toHaveBeenLastCalledWith("org", "asset", { name: "Oil" });
});
test.each([POST, vehiclePOST])(
  "mutation boundaries reject cross-origin requests and invalid JSON",
  async (handler) => {
    expect(
      (
        await handler(
          new Request(origin, {
            method: "POST",
            headers: {
              origin: "https://foreign.test",
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          new Request(origin, {
            method: "POST",
            headers: { origin, "Content-Type": "text/plain" },
            body: "{}",
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler(
          new Request(origin, {
            method: "POST",
            headers: { origin, "Content-Type": "application/json" },
            body: "{",
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  },
);
test("authorization and concurrency responses pass through safely", async () => {
  for (const status of [401, 403, 404, 409, 500]) {
    mocks.save.mockResolvedValue({ status, error: "Unavailable" });
    const response = await POST(
      new Request(origin, {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Unavailable" });
  }
});
