import { beforeEach, expect, test, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const command = vi.hoisted(() => vi.fn());
vi.mock("@/modules/organizations/commands", () => ({
  createOrganization: command,
}));
vi.mock("@/modules/organizations/queries", () => ({
  getAccessibleOrganizations: query,
}));
import { GET, POST } from "./route";

beforeEach(() => {
  command.mockReset().mockResolvedValue({
    status: 201,
    body: { organization: { id: "created" } },
  });
  query
    .mockReset()
    .mockResolvedValue({ status: 200, body: { organizations: [] } });
});

test.each(["https://attacker.example", "null", ""])(
  "rejects creation from an untrusted or missing origin: %s",
  async (origin) => {
    const response = await POST(
      new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: '{"name":"Team"}',
      }),
    );
    expect(response.status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  },
);

test("rejects invalid JSON before executing creation", async () => {
  const response = await POST(
    new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "invalid",
    }),
  );
  expect(response.status).toBe(400);
  expect(command).not.toHaveBeenCalled();
});

test.each([201, 400, 401, 500])(
  "creation returns command status %s and prevents caching",
  async (status) => {
    command.mockResolvedValue({ status, body: { result: "test" } });
    const response = await POST(
      new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: '{"name":"Team"}',
      }),
    );
    expect(response.status).toBe(status);
    expect(command).toHaveBeenCalledWith({ name: "Team" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  },
);

test("creation returns a complete JSON body containing the organization ID", async () => {
  const response = await POST(
    new Request("http://localhost/api/organizations", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: '{"name":"Team"}',
    }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  await expect(response.json()).resolves.toEqual({
    organization: { id: "created" },
  });
  expect(response.bodyUsed).toBe(true);
});

test.each(["", "not-a-uuid", "' or true --"])(
  "rejects invalid organization ID: %s",
  async (id) => {
    const response = await GET(
      new Request(
        `http://localhost/api/organizations?organization_id=${encodeURIComponent(id)}`,
      ),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  },
);

test("normalizes UUIDs before checking membership", async () => {
  await GET(
    new Request(
      "http://localhost/api/organizations?organization_id=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    ),
  );
  expect(query).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

test.each([200, 401, 404, 500])(
  "never caches authenticated responses, including status %s",
  async (status) => {
    query.mockResolvedValue({ status, body: { organizations: [] } });
    const response = await GET(
      new Request("http://localhost/api/organizations"),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  },
);
