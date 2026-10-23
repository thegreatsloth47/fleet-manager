import { beforeEach, expect, test, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./queries", () => ({ getAccessibleOrganizations: query }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { resolveOrganizationPage } from "./page-access";
beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({
    status: 200,
    body: {
      organizations: [
        {
          id: "internal-uuid",
          slug: "acme-plumbing",
          name: "Renamed organization",
        },
      ],
    },
  });
});
test("resolves a stable slug to the internal ID from accessible memberships", async () => {
  expect(await resolveOrganizationPage("acme-plumbing")).toBe("internal-uuid");
  expect(query).toHaveBeenCalledWith();
});
test.each(["another-tenant", "missing", "internal-uuid"])(
  "does not disclose or accept inaccessible/legacy identifier %s",
  async (slug) => {
    await expect(resolveOrganizationPage(slug)).rejects.toThrow("NOT_FOUND");
  },
);
test("revoked membership removes slug access", async () => {
  query.mockResolvedValue({ status: 200, body: { organizations: [] } });
  await expect(resolveOrganizationPage("acme-plumbing")).rejects.toThrow(
    "NOT_FOUND",
  );
});
test("requires login", async () => {
  query.mockResolvedValue({
    status: 401,
    body: { error: "Authentication required." },
  });
  await expect(resolveOrganizationPage("acme-plumbing")).rejects.toThrow(
    "REDIRECT:/auth",
  );
});
test("fails closed on lookup failure", async () => {
  query.mockResolvedValue({
    status: 500,
    body: { error: "Unable to load organizations." },
  });
  await expect(resolveOrganizationPage("acme-plumbing")).rejects.toThrow(
    "Unable to load organizations.",
  );
});
