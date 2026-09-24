"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  auditLines,
  currentMeterReading,
  type MeterHistory,
} from "@/modules/meters/meter";

type Props = {
  organizationId: string;
  assetId: string;
  history: MeterHistory[];
  canManage: boolean;
  vehicleName: string;
};
type Selection = {
  action: "baseline" | "reading" | "replacement" | "correct" | "void";
  target?: MeterHistory;
};

export default function MileagePanel({
  organizationId,
  assetId,
  history,
  canManage,
  vehicleName,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const current = currentMeterReading(history);
  const { action, target } = selection ?? {
    action: current ? "reading" : "baseline",
  };
  const kind = target?.kind ?? action;
  const correction = action === "correct" || action === "void";
  const unit = current?.unit === "km" ? "km" : "mi";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = { action };
    for (const [key, value] of form.entries())
      if (typeof value === "string" && value.trim())
        payload[key] = value.trim();
    if (correction && target) {
      payload.entry_id = target.id;
      payload.expected_revision_id = target.revision_id;
    } else {
      payload.observed_at = new Date(payload.observed_at).toISOString();
    }
    if (action === "baseline" && !payload.baseline_usage)
      payload.baseline_usage = payload.physical;
    const signature = JSON.stringify(payload);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    payload.command_id = retry.current.id;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vehicles/${assetId}/mileage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const error: unknown =
          result && typeof result === "object"
            ? Reflect.get(result, "error")
            : null;
        setMessage(
          typeof error === "string" ? error : "Unable to save mileage.",
        );
        return;
      }
      setMessage("Mileage saved.");
      setSelection(null);
      router.refresh();
    } catch {
      setMessage(
        "Unable to confirm the save. Retry this form to safely check or complete the same submission.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h2>{vehicleName}</h2>
      {current ? (
        <dl>
          <dt>Physical odometer</dt>
          <dd>
            {current.physical} {unit}
          </dd>
          <dt>Accumulated usage</dt>
          <dd>
            {current.accumulated} {unit}
          </dd>
          <dt>Last observed</dt>
          <dd>{current.observed_at}</dd>
        </dl>
      ) : (
        <p>No mileage recorded yet.</p>
      )}
      <p>
        Accumulated usage continues across odometer replacements. Initial
        accumulated usage is a declared baseline.
      </p>
      {!canManage && <p>Mileage is read-only.</p>}
      {canManage && (
        <section aria-label="Record mileage">
          {current && (
            <p>
              <button
                disabled={pending}
                onClick={() => setSelection({ action: "reading" })}
              >
                Add reading
              </button>{" "}
              <button
                disabled={pending}
                onClick={() => setSelection({ action: "replacement" })}
              >
                Replace/reset odometer
              </button>
            </p>
          )}
          <h3>
            {action === "baseline"
              ? "Initial mileage"
              : action === "correct"
                ? "Correct entry"
                : action === "void"
                  ? "Void reading"
                  : action === "replacement"
                    ? "Physical odometer replacement/reset"
                    : "Add reading"}
          </h3>
          {target && (
            <p>
              Selected {target.kind}: {target.physical} {unit}, observed{" "}
              {target.observed_at}. Original evidence and all revisions will
              remain in history. Corrections keep the observation time fixed.
            </p>
          )}
          {action === "replacement" && (
            <p>
              Use a time after all recorded observations. The new starting
              reading does not add mileage.
            </p>
          )}
          <form
            key={`${action}-${target?.revision_id ?? current?.revision_id ?? "new"}`}
            onSubmit={submit}
          >
            <fieldset disabled={pending}>
              {action === "baseline" && (
                <p>
                  <label>
                    Unit{" "}
                    <select name="unit" defaultValue="mi">
                      <option value="mi">Miles</option>
                      <option value="km">Kilometers</option>
                    </select>
                  </label>{" "}
                  (locked after initialization)
                </p>
              )}
              {!correction && (
                <p>
                  <label>
                    Observed at (your local time){" "}
                    <input
                      type="datetime-local"
                      name="observed_at"
                      step="1"
                      required
                    />
                  </label>
                </p>
              )}
              {action !== "void" && (
                <>
                  <p>
                    <label>
                      {kind === "replacement"
                        ? "New odometer starting reading"
                        : "Physical odometer reading"}{" "}
                      <input
                        name="physical"
                        type="number"
                        min="0"
                        max="999999999.9"
                        step="0.1"
                        required
                        defaultValue={target?.physical}
                      />
                    </label>
                  </p>
                  {kind === "baseline" && (
                    <p>
                      <label>
                        Declared accumulated usage{" "}
                        <input
                          name="baseline_usage"
                          type="number"
                          min="0"
                          max="999999999.9"
                          step="0.1"
                          defaultValue={target?.baseline_usage ?? ""}
                          required={action === "correct"}
                        />
                      </label>{" "}
                      Leave blank initially to use the physical reading. Explain
                      a higher known value.
                    </p>
                  )}
                  {kind === "replacement" && (
                    <p>
                      <label>
                        Old odometer final reading{" "}
                        <input
                          name="old_final"
                          type="number"
                          min="0"
                          max="999999999.9"
                          step="0.1"
                          required
                          defaultValue={target?.old_final ?? ""}
                        />
                      </label>
                    </p>
                  )}
                </>
              )}
              <p>
                <label>
                  Reason / notes{" "}
                  <textarea
                    name="reason"
                    maxLength={2000}
                    required={correction || action === "replacement"}
                  />
                </label>
              </p>
              <button type="submit">
                {pending
                  ? "Saving…"
                  : action === "void"
                    ? "Confirm void"
                    : "Save mileage"}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <h2>Reading history</h2>
      <p>
        Times below include their UTC offset. A voided reading does not
        contribute to accumulated usage.
      </p>
      <ol>
        {[...history].reverse().map((row) => (
          <li key={row.id}>
            <p>
              <strong>
                {row.kind === "baseline"
                  ? "Initial baseline"
                  : row.kind === "replacement"
                    ? "Physical replacement/reset"
                    : "Reading"}
                {row.voided ? " — voided" : ""}
              </strong>{" "}
              · {row.observed_at}
            </p>
            <p>
              Physical: {row.physical} {row.unit}
              {!row.voided && (
                <>
                  {" "}
                  · Accumulated: {row.accumulated} {row.unit}
                </>
              )}
            </p>
            {row.old_final !== null && (
              <p>
                Old meter final: {row.old_final} {row.unit}
              </p>
            )}
            {canManage && (
              <p>
                <button
                  disabled={pending}
                  onClick={() =>
                    setSelection({ action: "correct", target: row })
                  }
                >
                  {row.voided ? "Correct and restore" : "Correct"}
                </button>{" "}
                {row.kind === "reading" && !row.voided && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      setSelection({ action: "void", target: row })
                    }
                  >
                    Void
                  </button>
                )}
              </p>
            )}
            <details>
              <summary>Original entry and audit history</summary>
              {auditLines(row.audit).map((line, index) => (
                <p
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  key={index}
                >
                  {line}
                </p>
              ))}
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}
