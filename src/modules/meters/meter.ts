export type MeterResult<T> =
  | { status: 200 | 201; data: T; error?: never }
  | { status: 400 | 401 | 403 | 404 | 409 | 500; error: string; data?: never };

export type MeterHistory = {
  id: string;
  revision_id: string;
  kind: string;
  unit: string;
  observed_at: string;
  physical: string;
  old_final: string | null;
  baseline_usage: string | null;
  accumulated: string;
  voided: boolean;
  audit: string;
};

export type MeterCommand = {
  command_id: string;
  action: "baseline" | "reading" | "replacement" | "correct" | "void";
  unit?: "mi" | "km";
  observed_at?: string;
  physical?: string;
  old_final?: string;
  baseline_usage?: string;
  reason?: string;
  entry_id?: string;
  expected_revision_id?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decimal = /^[0-9]{1,9}(\.[0-9])?$/;

// Decimal strings preserve the database's exact tenths at the API boundary.
export function parseMeterCommand(
  input: unknown,
  now = Date.now(),
): MeterResult<MeterCommand> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { status: 400, error: "Provide mileage details." };
  const fields = [
    "command_id",
    "action",
    "unit",
    "observed_at",
    "physical",
    "old_final",
    "baseline_usage",
    "reason",
    "entry_id",
    "expected_revision_id",
  ];
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      !fields.includes(key) ||
      typeof value !== "string" ||
      value.includes("\0")
    )
      return { status: 400, error: "Invalid mileage field." };
    data[key] = value;
  }
  const action = data.action;
  if (
    !uuid.test(data.command_id ?? "") ||
    !["baseline", "reading", "replacement", "correct", "void"].includes(action)
  )
    return { status: 400, error: "Invalid mileage command." };
  const reason = data.reason?.trim();
  if (
    (data.reason !== undefined && !reason) ||
    (reason && Array.from(reason).length > 2000)
  )
    return { status: 400, error: "Reason must contain 1–2000 characters." };
  if (["correct", "void", "replacement"].includes(action) && !reason)
    return { status: 400, error: "A reason is required." };
  if (action === "correct" || action === "void") {
    if (
      !uuid.test(data.entry_id ?? "") ||
      !uuid.test(data.expected_revision_id ?? "") ||
      data.observed_at !== undefined ||
      data.unit !== undefined
    )
      return {
        status: 400,
        error: "Select a reading to correct; its time and unit stay fixed.",
      };
  } else {
    const date = data.observed_at;
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
        date,
      ) ||
      !Number.isFinite(Date.parse(date)) ||
      Date.parse(date) > now
    )
      return {
        status: 400,
        error: "Provide an observation time that is not in the future.",
      };
    if (data.entry_id !== undefined || data.expected_revision_id !== undefined)
      return { status: 400, error: "Unexpected correction fields." };
  }
  if (
    action === "baseline"
      ? !["mi", "km"].includes(data.unit)
      : data.unit !== undefined
  )
    return {
      status: 400,
      error:
        "Choose miles or kilometers when initializing; the unit is then locked.",
    };
  if (action === "void") {
    if (
      ["physical", "old_final", "baseline_usage"].some(
        (key) => data[key] !== undefined,
      )
    )
      return {
        status: 400,
        error: "Voiding does not accept replacement values.",
      };
  } else {
    if (
      !decimal.test(data.physical ?? "") ||
      ["old_final", "baseline_usage"].some(
        (key) => data[key] !== undefined && !decimal.test(data[key]),
      )
    )
      return {
        status: 400,
        error: "Readings must be 0–999999999.9 with at most one decimal place.",
      };
    if (
      (action === "baseline" && data.baseline_usage === undefined) ||
      (action === "replacement" && data.old_final === undefined)
    )
      return {
        status: 400,
        error: "Provide the baseline or old meter final reading.",
      };
    if (
      (action !== "baseline" &&
        action !== "correct" &&
        data.baseline_usage !== undefined) ||
      (action !== "replacement" &&
        action !== "correct" &&
        data.old_final !== undefined)
    )
      return { status: 400, error: "Unexpected meter values." };
    if (
      data.baseline_usage !== undefined &&
      (Number(data.baseline_usage) < Number(data.physical) ||
        (Number(data.baseline_usage) > Number(data.physical) && !reason))
    )
      return {
        status: 400,
        error:
          "Accumulated baseline cannot be lower than the physical reading; explain any higher value.",
      };
  }
  // Build the discriminant explicitly after validation, without asserting input types.
  if (
    action !== "baseline" &&
    action !== "reading" &&
    action !== "replacement" &&
    action !== "correct" &&
    action !== "void"
  )
    return { status: 400, error: "Invalid action." };
  const unit = data.unit;
  if (unit !== undefined && unit !== "mi" && unit !== "km")
    return { status: 400, error: "Invalid unit." };
  return {
    status: 200,
    data: {
      command_id: data.command_id,
      action,
      ...(unit ? { unit } : {}),
      ...(data.observed_at ? { observed_at: data.observed_at } : {}),
      ...(data.physical !== undefined ? { physical: data.physical } : {}),
      ...(data.old_final !== undefined ? { old_final: data.old_final } : {}),
      ...(data.baseline_usage !== undefined
        ? { baseline_usage: data.baseline_usage }
        : {}),
      ...(reason ? { reason } : {}),
      ...(data.entry_id
        ? {
            entry_id: data.entry_id,
            expected_revision_id: data.expected_revision_id,
          }
        : {}),
    },
  };
}

export function auditLines(audit: string): string[] {
  const parsed: unknown = JSON.parse(audit);
  if (!parsed || typeof parsed !== "object") return [];
  const original: unknown = Reflect.get(parsed, "original");
  const revisions: unknown = Reflect.get(parsed, "revisions");
  return [original, ...(Array.isArray(revisions) ? revisions : [])].map(
    (item: unknown, index) => {
      if (!item || typeof item !== "object")
        return "Audit details unavailable.";
      const fields: [string, string][] = [
        ["physical", "Physical reading"],
        ["old_final", "Old meter final"],
        ["baseline_usage", "Declared accumulated baseline"],
        ["reason", "Reason"],
        ["actor", "User ID"],
        ["recorded_at", "Recorded at"],
        ["source", "Source"],
      ];
      const values = fields.flatMap(([key, label]) => {
        const value: unknown = Reflect.get(item, key);
        return typeof value === "string" ? [`${label}: ${value}`] : [];
      });
      return `${index === 0 ? "Original entry" : Reflect.get(item, "voided") === true ? "Void" : "Correction"}\n${values.join("\n")}`;
    },
  );
}

export function currentMeterReading(
  history: MeterHistory[],
): MeterHistory | undefined {
  return history.filter((entry) => !entry.voided).at(-1);
}
