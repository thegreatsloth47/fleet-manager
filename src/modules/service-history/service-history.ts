import {
  validDate,
  validId,
  type MaintenanceResult,
} from "@/modules/maintenance/maintenance";

export type ServiceRecord = {
  id: string;
  organization_id: string;
  asset_id: string;
  asset_type: string;
  service_date: string;
  title: string;
  provider: string | null;
  cost_cents: number | null;
  currency: string;
  notes: string | null;
  total_distance: number | null;
  distance_unit: string | null;
  schedule_ids: string[];
  voided: boolean;
  version: number;
  updated_by: string;
  updated_at: string;
};
export type ServiceRevision = {
  id: string;
  organization_id: string;
  asset_id: string;
  service_id: string;
  version: number;
  snapshot: ServiceRecord;
  reason: string | null;
  actor_id: string;
  recorded_at: string;
};
export type ScheduleEffect = {
  id: string;
  organization_id: string;
  asset_id: string;
  service_id: string;
  revision_id: string;
  schedule_id: string;
  schedule_name: string;
  service_date: string;
  reversal_of: string | null;
  before_usage: number | null;
  after_usage: number | null;
  before_date: string | null;
  after_date: string | null;
  before_version: number;
  after_version: number;
  distance_interval: number | null;
  distance_unit: string | null;
  prior_updated_at: string;
  time_interval: number | null;
  time_unit: string | null;
};
type CommandBase = {
  command_id: string;
  id: string;
  expected_version: number;
  reason: string | null;
};
export type ServiceCommand = CommandBase &
  (
    | { action: "void" }
    | {
        action: "save";
        service_date: string;
        title: string;
        provider: string | null;
        cost_cents: number | null;
        currency: "USD";
        notes: string | null;
        total_distance: string | null;
        schedule_ids: string[];
      }
  );
export function costCents(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function optionalText(value: unknown, max: number): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      !value.includes("\0") &&
      Array.from(value.trim()).length <= max)
  );
}
export function parseService(
  input: unknown,
): MaintenanceResult<ServiceCommand> {
  const invalid: MaintenanceResult<ServiceCommand> = {
    status: 400,
    error:
      "Check the service date, title, USD cost, total distance, schedules, and correction reason.",
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return invalid;
  const v: Record<string, unknown> = Object.fromEntries(Object.entries(input));
  const fields = [
    "command_id",
    "id",
    "expected_version",
    "action",
    "reason",
    ...(v.action === "save"
      ? [
          "service_date",
          "title",
          "provider",
          "cost_cents",
          "currency",
          "notes",
          "total_distance",
          "schedule_ids",
        ]
      : []),
  ];
  if (
    Object.keys(v).some((k) => !fields.includes(k)) ||
    fields.some((k) => !(k in v)) ||
    !validId(v.command_id) ||
    !validId(v.id) ||
    typeof v.expected_version !== "number" ||
    !Number.isSafeInteger(v.expected_version) ||
    v.expected_version < 0 ||
    v.expected_version >= 2147483647 ||
    !optionalText(v.reason, 2000) ||
    (v.expected_version > 0 && !v.reason?.trim())
  )
    return invalid;
  const base: CommandBase = {
    command_id: v.command_id,
    id: v.id,
    expected_version: v.expected_version,
    reason: v.reason?.trim() || null,
  };
  if (v.action === "void")
    return v.expected_version > 0
      ? { status: 200, data: { ...base, action: "void" } }
      : invalid;
  if (
    v.action !== "save" ||
    !validDate(v.service_date) ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    !optionalText(v.title, 200) ||
    !optionalText(v.provider, 200) ||
    !optionalText(v.notes, 4000) ||
    v.currency !== "USD" ||
    (v.cost_cents !== null &&
      (typeof v.cost_cents !== "number" ||
        !Number.isSafeInteger(v.cost_cents) ||
        v.cost_cents < 0 ||
        v.cost_cents > 99999999999)) ||
    (v.total_distance !== null &&
      (typeof v.total_distance !== "string" ||
        !/^[0-9]{1,9}(\.[0-9])?$/.test(v.total_distance))) ||
    !Array.isArray(v.schedule_ids) ||
    v.schedule_ids.length > 100 ||
    !v.schedule_ids.every(validId) ||
    new Set(v.schedule_ids).size !== v.schedule_ids.length
  )
    return invalid;
  return {
    status: 200,
    data: {
      ...base,
      action: "save",
      service_date: v.service_date,
      title: v.title.trim(),
      provider: v.provider?.trim() || null,
      notes: v.notes?.trim() || null,
      cost_cents: v.cost_cents,
      currency: "USD",
      total_distance: v.total_distance,
      schedule_ids: [...v.schedule_ids].sort(),
    },
  };
}
