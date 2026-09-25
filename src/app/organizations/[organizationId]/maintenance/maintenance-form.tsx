"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  defaultRule,
  type Rule,
  type Template,
  type Assignment,
} from "@/modules/maintenance/maintenance";

function RuleFields({ rule }: { rule: Rule }) {
  const id = useId();
  return (
    <>
      <p>
        <label htmlFor={`${id}-name`}>Service name</label>
        <br />
        <input
          id={`${id}-name`}
          name="name"
          defaultValue={rule.name}
          required
          maxLength={200}
        />
      </p>
      <p>
        Use distance, calendar time, or both. Leave the unused interval blank.
      </p>
      <p>
        <label htmlFor={`${id}-distance`}>Distance interval</label>
        <br />
        <input
          id={`${id}-distance`}
          name="distance_interval"
          type="number"
          min="0.1"
          max="999999999.9"
          step="0.1"
          defaultValue={rule.distance_interval ?? ""}
        />{" "}
        <label htmlFor={`${id}-unit`}>Distance unit</label>{" "}
        <select
          id={`${id}-unit`}
          name="distance_unit"
          defaultValue={rule.distance_unit ?? "mi"}
        >
          <option value="mi">Miles</option>
          <option value="km">Kilometers</option>
        </select>
      </p>
      <p>
        <label htmlFor={`${id}-time`}>Calendar interval</label>
        <br />
        <input
          id={`${id}-time`}
          name="time_interval"
          type="number"
          min="1"
          max="1000"
          step="1"
          defaultValue={rule.time_interval ?? ""}
        />{" "}
        <label htmlFor={`${id}-period`}>Calendar unit</label>{" "}
        <select
          id={`${id}-period`}
          name="time_unit"
          defaultValue={rule.time_unit ?? "months"}
        >
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
          <option value="years">Years</option>
        </select>
      </p>
      <p>
        <label htmlFor={`${id}-upcoming`}>Upcoming window (%)</label>
        <br />
        <input
          id={`${id}-upcoming`}
          name="upcoming_percent"
          type="number"
          min="0"
          max="100"
          step="1"
          required
          defaultValue={rule.upcoming_percent}
        />
      </p>
      <p>
        <label htmlFor={`${id}-due`}>Due window (%)</label>
        <br />
        <input
          id={`${id}-due`}
          name="due_percent"
          type="number"
          min="0"
          max="100"
          step="1"
          required
          defaultValue={rule.due_percent}
        />
      </p>
      <p>
        Due must not exceed upcoming. Calendar windows round up to whole days.
        Combined schedules show the most urgent status.
      </p>
    </>
  );
}

export default function MaintenanceForm({
  organizationId,
  template,
  assignment,
  assetId,
  templates = [],
}: {
  organizationId: string;
  template?: Template;
  assignment?: Assignment;
  assetId?: string;
  templates?: Template[];
}) {
  const router = useRouter();
  const id = useId();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const selected = templates.find((t) => t.id === templateId);
  const initial = assignment ?? template;
  const rule = initial ?? (assetId ? selected : defaultRule);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rule) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const number = (key: string) =>
      values.get(key) === "" ? null : Number(values.get(key));
    const isNewAssignment = assetId && !assignment;
    const fields = isNewAssignment
      ? {
          name: rule.name,
          distance_interval: rule.distance_interval,
          distance_unit: rule.distance_unit,
          time_interval: rule.time_interval,
          time_unit: rule.time_unit,
          upcoming_percent: rule.upcoming_percent,
          due_percent: rule.due_percent,
        }
      : {
          name: values.get("name"),
          distance_interval: number("distance_interval"),
          distance_unit:
            number("distance_interval") === null
              ? null
              : values.get("distance_unit"),
          time_interval: number("time_interval"),
          time_unit:
            number("time_interval") === null ? null : values.get("time_unit"),
          upcoming_percent: number("upcoming_percent"),
          due_percent: number("due_percent"),
        };
    const payload = {
      ...fields,
      id: initial?.id ?? crypto.randomUUID(),
      expected_version: initial?.version ?? 0,
      ...(assetId
        ? {
            template_id: assignment?.template_id ?? templateId,
            next_due_usage: number("next_due_usage"),
            next_due_date: values.get("next_due_date") || null,
            paused: values.get("paused") === "on",
          }
        : { enabled: values.get("enabled") === "on" }),
    };
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}${assetId ? `/vehicles/${assetId}` : ""}/maintenance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result && typeof result === "object"
            ? Reflect.get(result, "error")
            : null;
        setError(
          typeof message === "string" ? message : "Unable to save maintenance.",
        );
      } else {
        setSaved(true);
        if (!initial) form.reset();
        router.refresh();
      }
    } catch {
      setError("Unable to save maintenance. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending}>
        <legend>
          {assetId
            ? assignment
              ? "Edit vehicle schedule"
              : "Assign a maintenance template"
            : template
              ? "Edit template"
              : "Create maintenance template"}
        </legend>
        {assetId && !assignment ? (
          <>
            <p>
              <label htmlFor={`${id}-template`}>Maintenance template</label>
              <br />
              <select
                id={`${id}-template`}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                <option value="">Select a template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </p>
            {rule && (
              <p>
                {rule.distance_interval !== null &&
                  `Every ${rule.distance_interval} ${rule.distance_unit}. `}
                {rule.time_interval !== null &&
                  `Every ${rule.time_interval} ${rule.time_unit}. `}
                Upcoming {rule.upcoming_percent}%; due {rule.due_percent}%.
              </p>
            )}
          </>
        ) : (
          <RuleFields rule={rule ?? defaultRule} />
        )}
        {assetId ? (
          <>
            <p>
              Enter explicit targets for each interval in this schedule. Usage
              is accumulated vehicle usage, including prior odometers. Leave
              unused targets blank. These targets do not record completed
              service.
            </p>
            <p>
              <label htmlFor={`${id}-usage`}>Next due accumulated usage</label>
              <br />
              <input
                id={`${id}-usage`}
                name="next_due_usage"
                type="number"
                min="0"
                max="999999999.9"
                step="0.1"
                defaultValue={assignment?.next_due_usage ?? ""}
              />
            </p>
            <p>
              <label htmlFor={`${id}-date`}>Next due date</label>
              <br />
              <input
                id={`${id}-date`}
                name="next_due_date"
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={assignment?.next_due_date ?? ""}
              />
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  name="paused"
                  defaultChecked={assignment?.paused ?? false}
                />{" "}
                Pause this vehicle schedule
              </label>
            </p>
          </>
        ) : (
          <p>
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={template?.enabled ?? true}
              />{" "}
              Template enabled
            </label>
          </p>
        )}
        <button disabled={!rule}>
          {pending
            ? "Saving…"
            : assetId
              ? assignment
                ? "Save schedule"
                : "Assign schedule"
              : template
                ? "Save template"
                : "Create template"}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Maintenance saved.</p>}
    </form>
  );
}
