import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MeterHistory } from "@/modules/meters/meter";
const hooks = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  refreshing: false,
  ref: { current: null as unknown },
  refresh: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.state)) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] = value;
      },
    ];
  },
  useRef: () => hooks.ref,
  useTransition: () => [
    hooks.refreshing,
    (callback: () => void) => {
      hooks.refreshing = true;
      callback();
    },
  ],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: hooks.refresh }),
}));
import MileagePanel from "./mileage-panel";
let fields: Record<string, string>;
const fetchMock = vi.fn();
function render(history: MeterHistory[] = []) {
  hooks.cursor = 0;
  return MileagePanel({
    organizationId: "org",
    assetId: "asset",
    history,
    canManage: true,
    vehicleName: "Van",
  });
}
function find(
  node: ReactNode,
  type: string,
):
  { children?: ReactNode; onSubmit?: unknown; disabled?: boolean } | undefined {
  for (const child of Children.toArray(node)) {
    if (
      !isValidElement<{
        children?: ReactNode;
        onSubmit?: unknown;
        disabled?: boolean;
      }>(child)
    )
      continue;
    if (child.type === type) return child.props;
    const match = find(child.props.children, type);
    if (match) return match;
  }
}
async function submit(tree: ReactNode) {
  const handler = find(tree, "form")?.onSubmit;
  if (typeof handler !== "function") throw new Error("Missing form handler");
  await handler({ preventDefault: vi.fn(), currentTarget: undefined });
}
beforeEach(() => {
  hooks.state = [];
  hooks.cursor = 0;
  hooks.refreshing = false;
  hooks.ref.current = null;
  hooks.refresh.mockReset();
  fields = {
    unit: "mi",
    observed_at: "2020-01-01T12:00:00Z",
    physical: "10000",
  };
  fetchMock
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => ({ id: "baseline" }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "FormData",
    class {
      entries() {
        return Object.entries(fields);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
test("successful baseline stays disabled until refreshed history changes the command to a reading", async () => {
  await submit(render());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    action: "baseline",
    physical: "10000",
  });
  expect(hooks.refresh).toHaveBeenCalledOnce();
  const stale = render();
  expect(find(stale, "fieldset")?.disabled).toBe(true);
  fields = {
    unit: "mi",
    observed_at: "2020-12-01T12:00:00Z",
    physical: "20000",
  };
  await submit(stale);
  expect(fetchMock).toHaveBeenCalledOnce();
  // Next commits the refreshed server history before finishing the transition.
  hooks.refreshing = false;
  const history: MeterHistory[] = [
    {
      id: "baseline",
      revision_id: "baseline",
      kind: "baseline",
      unit: "mi",
      observed_at: "2020-01-01T12:00:00Z",
      physical: "10000",
      old_final: null,
      baseline_usage: "10000",
      accumulated: "10000",
      voided: false,
      audit: '{"original":{}}',
    },
  ];
  const refreshed = render(history);
  expect(find(refreshed, "fieldset")?.disabled).toBe(false);
  fields = { observed_at: "2020-12-01T12:00:00Z", physical: "20000" };
  await submit(refreshed);
  const second = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(second).toMatchObject({ action: "reading", physical: "20000" });
  expect(second).not.toHaveProperty("baseline_usage");
  expect(second).not.toHaveProperty("unit");
});
test("failed submissions remain retryable without starting a refresh", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Unable to record mileage." }),
  });
  await submit(render());
  expect(hooks.refresh).not.toHaveBeenCalled();
  const retry = render();
  expect(find(retry, "fieldset")?.disabled).toBe(false);
  await submit(retry);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
});
