export type Rule = {
  name: string;
  distance_interval: number | null;
  distance_unit: "mi" | "km" | null;
  time_interval: number | null;
  time_unit: "days" | "weeks" | "months" | "years" | null;
  upcoming_percent: number;
  due_percent: number;
};
export type Template = Rule & {
  id: string;
  organization_id: string;
  enabled: boolean;
  version: number;
  updated_by: string;
  updated_at: string;
};
export type Assignment = Rule & {
  id: string;
  organization_id: string;
  asset_id: string;
  asset_type: string;
  template_id: string;
  meter_id: string | null;
  next_due_usage: number | null;
  next_due_date: string | null;
  paused: boolean;
  version: number;
  updated_by: string;
  updated_at: string;
};
export type MaintenanceCommand = Rule & {
  id: string;
  expected_version: number;
  enabled?: boolean;
  template_id?: string;
  next_due_usage?: number | null;
  next_due_date?: string | null;
  paused?: boolean;
};
export type MaintenanceResult<T> =
  | { status: 200 | 201; data: T; error?: never }
  | { status: 400 | 401 | 403 | 404 | 409 | 500; error: string; data?: never };
export const urgency = { "Not due": 0, Upcoming: 1, Due: 2, Overdue: 3 };
export type DueStatus = keyof typeof urgency;
export const defaultRule: Rule = {
  name: "",
  distance_interval: null,
  distance_unit: null,
  time_interval: null,
  time_unit: null,
  upcoming_percent: 10,
  due_percent: 5,
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "1900-01-01" &&
    value <= "9999-12-31" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function distance(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 999999999.9 &&
    /^\d+(\.\d)?$/.test(String(value))
  );
}
export function parseMaintenance(
  input: unknown,
  assignment: boolean,
): MaintenanceResult<MaintenanceCommand> {
  const invalid: MaintenanceResult<MaintenanceCommand> = {
    status: 400,
    error:
      "Provide valid intervals, matching units, explicit targets, and windows with 0 ≤ due ≤ upcoming ≤ 100%.",
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const v: Record<string, unknown> = Object.fromEntries(Object.entries(input));
  const fields = [
    "id",
    "expected_version",
    ...Object.keys(defaultRule),
    ...(assignment
      ? ["template_id", "next_due_usage", "next_due_date", "paused"]
      : ["enabled"]),
  ];
  if (
    Object.keys(v).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in v))
  )
    return invalid;
  if (
    !validId(v.id) ||
    typeof v.expected_version !== "number" ||
    !Number.isInteger(v.expected_version) ||
    v.expected_version < 0
  )
    return invalid;
  if (
    typeof v.name !== "string" ||
    !v.name.trim() ||
    Array.from(v.name.trim()).length > 200 ||
    v.name.includes("\0")
  )
    return invalid;
  const di = v.distance_interval,
    du = v.distance_unit,
    ti = v.time_interval,
    tu = v.time_unit;
  if (
    di === null
      ? du !== null
      : !distance(di) || di === 0 || (du !== "mi" && du !== "km")
  )
    return invalid;
  if (
    ti === null
      ? tu !== null
      : typeof ti !== "number" ||
        !Number.isInteger(ti) ||
        ti < 1 ||
        ti > 1000 ||
        !["days", "weeks", "months", "years"].includes(String(tu))
  )
    return invalid;
  if (di === null && ti === null) return invalid;
  if (
    typeof v.upcoming_percent !== "number" ||
    typeof v.due_percent !== "number" ||
    !Number.isInteger(v.upcoming_percent) ||
    !Number.isInteger(v.due_percent) ||
    v.due_percent < 0 ||
    v.upcoming_percent > 100 ||
    v.due_percent > v.upcoming_percent
  )
    return invalid;
  // Narrow every external value before constructing the command.
  if (di !== null && !distance(di)) return invalid;
  if (du !== null && du !== "mi" && du !== "km") return invalid;
  if (ti !== null && typeof ti !== "number") return invalid;
  if (
    tu !== null &&
    tu !== "days" &&
    tu !== "weeks" &&
    tu !== "months" &&
    tu !== "years"
  )
    return invalid;
  const rule: MaintenanceCommand = {
    id: v.id,
    expected_version: v.expected_version,
    name: v.name.trim(),
    distance_interval: di,
    distance_unit: du,
    time_interval: ti,
    time_unit: tu,
    upcoming_percent: v.upcoming_percent,
    due_percent: v.due_percent,
  };
  if (!assignment)
    return typeof v.enabled === "boolean"
      ? { status: 200, data: { ...rule, enabled: v.enabled } }
      : invalid;
  if (!validId(v.template_id) || typeof v.paused !== "boolean") return invalid;
  if (di === null ? v.next_due_usage !== null : !distance(v.next_due_usage))
    return invalid;
  if (ti === null ? v.next_due_date !== null : !validDate(v.next_due_date))
    return invalid;
  if (v.next_due_usage !== null && !distance(v.next_due_usage)) return invalid;
  if (v.next_due_date !== null && !validDate(v.next_due_date)) return invalid;
  return {
    status: 200,
    data: {
      ...rule,
      template_id: v.template_id,
      paused: v.paused,
      next_due_usage: v.next_due_usage,
      next_due_date: v.next_due_date,
    },
  };
}

export function organizationDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
const dayMs = 86400000;
// UTC arithmetic represents calendar dates, not elapsed local hours across DST.
export function shiftCalendar(
  date: string,
  count: number,
  unit: NonNullable<Rule["time_unit"]>,
): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (unit === "days" || unit === "weeks")
    d.setUTCDate(d.getUTCDate() + count * (unit === "weeks" ? 7 : 1));
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + count * (unit === "years" ? 12 : 1));
    const end = new Date(d.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    d.setUTCDate(Math.min(day, end.getUTCDate()));
  }
  return d.toISOString().split("T")[0];
}
function threshold(
  remaining: number,
  upcoming: number,
  due: number,
): DueStatus {
  if (remaining < 0) return "Overdue";
  if (remaining <= due) return "Due";
  if (remaining <= upcoming) return "Upcoming";
  return "Not due";
}
export function maintenanceState(
  rule: Assignment,
  usage: string | null,
  today: string,
) {
  let distanceStatus: DueStatus | null = null;
  let timeStatus: DueStatus | null = null;
  let remainingUsage: number | null = null;
  let remainingDays: number | null = null;
  if (
    rule.distance_interval !== null &&
    rule.next_due_usage !== null &&
    usage !== null
  ) {
    // Integer tenths avoid boundary drift from decimal subtraction.
    const remainingTenths =
      Math.round(rule.next_due_usage * 10) - Math.round(Number(usage) * 10);
    remainingUsage = remainingTenths / 10;
    distanceStatus = threshold(
      remainingTenths * 100,
      Math.round(rule.distance_interval * 10) * rule.upcoming_percent,
      Math.round(rule.distance_interval * 10) * rule.due_percent,
    );
  }
  if (rule.time_interval !== null && rule.time_unit && rule.next_due_date) {
    const target = Date.parse(rule.next_due_date);
    const previous = Date.parse(
      shiftCalendar(rule.next_due_date, -rule.time_interval, rule.time_unit),
    );
    const intervalDays = (target - previous) / dayMs;
    remainingDays = (target - Date.parse(today)) / dayMs;
    timeStatus = threshold(
      remainingDays,
      Math.ceil((intervalDays * rule.upcoming_percent) / 100),
      Math.ceil((intervalDays * rule.due_percent) / 100),
    );
  }
  const status = [distanceStatus, timeStatus].reduce<DueStatus>(
    (most, next) => (next && urgency[next] > urgency[most] ? next : most),
    "Not due",
  );
  return {
    status,
    distanceStatus,
    timeStatus,
    remainingUsage,
    remainingDays,
    missingUsage: rule.distance_interval !== null && usage === null,
  };
}
