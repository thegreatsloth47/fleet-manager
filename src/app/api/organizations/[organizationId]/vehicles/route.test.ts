import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  archive: vi.fn(),
}));
vi.mock("@/modules/assets/queries", () => ({ getVehicles: mocks.get }));
vi.mock("@/modules/assets/commands", () => ({
  saveVehicle: mocks.save,
  archiveVehicle: mocks.archive,
}));
import { GET, POST } from "./route";
import { GET as detail, PUT } from "./[assetId]/route";
import { POST as archive } from "./[assetId]/archive/route";
const context = {
  params: Promise.resolve({ organizationId: "org-a", assetId: "asset-a" }),
};
function request(
  body = '{"name":"Van"}',
  origin: string | null = "https://fleet.test",
  type = "application/json",
) {
  const headers = new Headers({ "content-type": type });
  if (origin) headers.set("origin", origin);
  return new Request("https://fleet.test/api/organizations/org-a/vehicles", {
    method: "POST",
    headers,
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue({ status: 201, data: { id: "asset-a" } });
  mocks.archive.mockResolvedValue({ status: 200, data: { id: "asset-a" } });
  mocks.get.mockResolvedValue({
    status: 200,
    data: { vehicles: [], canManage: true },
  });
});

test.each([POST, PUT, archive])(
  "rejects missing or foreign origins for every mutation",
  async (handler) => {
    for (const origin of [null, "https://foreign.test"]) {
      const result = await handler(request("{}", origin), context);
      expect(result.status).toBe(403);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  },
);
test.each([POST, PUT, archive])(
  "rejects malformed JSON and incorrect content types",
  async (handler) => {
    expect((await handler(request("{"), context)).status).toBe(400);
    expect(
      (
        await handler(
          request("{}", "https://fleet.test", "text/plain"),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  },
);
test("dispatches create and edit with tenant and asset scope", async () => {
  const created = await POST(request(), context);
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ id: "asset-a" });
  expect(mocks.save).toHaveBeenLastCalledWith("org-a", null, { name: "Van" });
  await PUT(request(), context);
  expect(mocks.save).toHaveBeenLastCalledWith("org-a", "asset-a", {
    name: "Van",
  });
});
test("archive accepts only an empty object and dispatches an explicit command", async () => {
  for (const body of ['{"archived_at":null}', "null", "[]"])
    expect((await archive(request(body), context)).status).toBe(400);
  expect(mocks.archive).not.toHaveBeenCalled();
  expect((await archive(request("{}"), context)).status).toBe(200);
  expect(mocks.archive).toHaveBeenCalledWith("org-a", "asset-a");
});
test("reads dispatch scoped queries and are private", async () => {
  const response = await GET(
    new Request(
      "https://fleet.test/api/organizations/org-a/vehicles?archived=true",
    ),
    context,
  );
  expect(mocks.get).toHaveBeenLastCalledWith("org-a", { archived: true });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  await detail(request(), context);
  expect(mocks.get).toHaveBeenLastCalledWith("org-a", { assetId: "asset-a" });
});
test("returns authorization and conflict errors from the application layer", async () => {
  mocks.save.mockResolvedValue({
    status: 409,
    error: "Duplicate name or VIN.",
  });
  const result = await POST(request(), context);
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({ error: "Duplicate name or VIN." });
  mocks.get.mockResolvedValue({
    status: 404,
    error: "Organization not found.",
  });
  expect((await GET(request(), context)).status).toBe(404);
});
