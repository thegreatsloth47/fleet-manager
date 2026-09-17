import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), redirect: vi.fn() }));
vi.mock("@/modules/organizations/queries", () => ({
  getAccessibleOrganizations: mocks.query,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./create-form", () => ({
  default: () => <p>Create organization form</p>,
}));
import OrganizationsPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

test("signed-out visitors are redirected before rendering organization data", async () => {
  mocks.query.mockResolvedValue({
    status: 401,
    body: { error: "Authentication required." },
  });
  await expect(OrganizationsPage()).rejects.toThrow("REDIRECT:/auth");
});

test("renders only organizations returned by the authorized server query", async () => {
  mocks.query.mockResolvedValue({
    status: 200,
    body: { organizations: [{ id: "a", name: "Team A" }] },
  });
  const html = renderToStaticMarkup(await OrganizationsPage());
  expect(html).toContain("Team A");
  expect(html).toContain("Create organization form");
});

test("shows the empty membership state after revocation is revalidated", async () => {
  mocks.query.mockResolvedValue({ status: 200, body: { organizations: [] } });
  expect(renderToStaticMarkup(await OrganizationsPage())).toContain(
    "You have no active organization memberships.",
  );
});
