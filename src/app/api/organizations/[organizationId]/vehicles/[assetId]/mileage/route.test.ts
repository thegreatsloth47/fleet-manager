import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), record: vi.fn() }));
vi.mock("@/modules/meters/service", () => ({
  getMileage: mocks.get,
  recordMileage: mocks.record,
}));
import { GET, POST } from "./route";
const context = {
  params: Promise.resolve({ organizationId: "org", assetId: "asset" }),
};
function request(
  body = "{}",
  origin: string | null = "https://fleet.test",
  contentType = "application/json",
) {
  const headers = new Headers({ "Content-Type": contentType });
  if (origin) headers.set("Origin", origin);
  return new Request("https://fleet.test/api/mileage", {
    method: "POST",
    headers,
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ status: 200, data: { history: [] } });
  mocks.record.mockResolvedValue({ status: 201, data: { id: "id" } });
});
test("rejects foreign or missing origin and malformed bodies before dispatch", async () => {
  for (const origin of [null, "https://other.test"])
    expect((await POST(request("{}", origin), context)).status).toBe(403);
  expect((await POST(request("{"), context)).status).toBe(400);
  expect(
    (await POST(request("{}", "https://fleet.test", "text/plain"), context))
      .status,
  ).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});
test("scopes reads and writes and disables caching", async () => {
  const read = await GET(request(), context);
  expect(mocks.get).toHaveBeenCalledWith("org", "asset");
  expect(read.headers.get("cache-control")).toBe("private, no-store");
  const write = await POST(request('{"action":"reading"}'), context);
  expect(mocks.record).toHaveBeenCalledWith("org", "asset", {
    action: "reading",
  });
  expect(write.status).toBe(201);
  expect(write.headers.get("cache-control")).toBe("private, no-store");
});
test("preserves domain errors", async () => {
  mocks.record.mockResolvedValue({ status: 409, error: "History changed" });
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "History changed" });
});
