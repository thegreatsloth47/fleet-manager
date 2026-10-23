"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServiceHistory } from "@/modules/service-history/service";
import {
  costCents,
  type ServiceRecord,
} from "@/modules/service-history/service-history";

function ServiceDetails({ record }: { record: ServiceRecord }) {
  return (
    <>
      <p>
        {record.service_date} · {record.provider ?? "Provider not recorded"} ·{" "}
        {record.cost_cents === null
          ? "Cost unknown"
          : `$${(record.cost_cents / 100).toFixed(2)} USD`}
      </p>
      <p>
        Total distance:{" "}
        {record.total_distance === null
          ? "Unknown"
          : `${record.total_distance} ${record.distance_unit}`}
      </p>
      {record.notes && (
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {record.notes}
        </p>
      )}
    </>
  );
}
export default function ServicePanel({
  organizationId,
  assetId,
  history,
}: {
  organizationId: string;
  assetId: string;
  history: ServiceHistory;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<{
    record: ServiceRecord;
    voiding: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const retry = useRef<{
    signature: string;
    commandId: string;
    serviceId: string;
  } | null>(null);
  const record = selection?.record;
  const voiding = selection?.voiding ?? false;
  const { canManage, today, items } = history.maintenance;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const cost = costCents(value("cost"));
    if (Number.isNaN(cost)) {
      setMessage("Enter a USD cost with at most two decimal places.");
      return;
    }
    const payload = {
      action: voiding ? "void" : "save",
      expected_version: record?.version ?? 0,
      reason: value("reason") || null,
      ...(!voiding
        ? {
            service_date: value("service_date"),
            title: value("title"),
            provider: value("provider") || null,
            cost_cents: cost,
            currency: "USD",
            notes: value("notes") || null,
            total_distance: value("total_distance") || null,
            schedule_ids: form.getAll("schedule_ids").map(String).sort(),
          }
        : {}),
    };
    const signature = JSON.stringify([record?.id, payload]);
    if (retry.current?.signature !== signature)
      retry.current = {
        signature,
        commandId: crypto.randomUUID(),
        serviceId: record?.id ?? crypto.randomUUID(),
      };
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vehicles/${assetId}/service-history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            command_id: retry.current.commandId,
            id: retry.current.serviceId,
          }),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const error: unknown =
          result && typeof result === "object"
            ? Reflect.get(result, "error")
            : null;
        setMessage(
          typeof error === "string" ? error : "Unable to save service.",
        );
        return;
      }
      setSelection(null);
      router.refresh();
      setMessage("Service saved.");
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
      {!canManage && <p>Service history is read-only.</p>}
      {canManage && (
        <section aria-label="Record service">
          <h2>
            {voiding
              ? "Void service"
              : record
                ? "Edit service"
                : "Record completed service"}
          </h2>
          {record && (
            <p>
              <button disabled={pending} onClick={() => setSelection(null)}>
                Cancel edit
              </button>
            </p>
          )}
          {voiding && (
            <p>
              Voiding preserves this record and reverses its schedule effects
              only if no later service or manual schedule change has occurred.
            </p>
          )}
          <form key={`${record?.id ?? "new"}-${voiding}`} onSubmit={submit}>
            <fieldset disabled={pending}>
              {!voiding && (
                <>
                  <p>
                    <label>
                      Service date{" "}
                      <input
                        name="service_date"
                        type="date"
                        required
                        max={today}
                        min="1900-01-01"
                        defaultValue={record?.service_date ?? today}
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      Service title{" "}
                      <input
                        name="title"
                        required
                        maxLength={200}
                        defaultValue={record?.title}
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      Provider / shop{" "}
                      <input
                        name="provider"
                        maxLength={200}
                        defaultValue={record?.provider ?? ""}
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      Cost (USD){" "}
                      <input
                        name="cost"
                        type="number"
                        min="0"
                        max="999999999.99"
                        step="0.01"
                        defaultValue={
                          record?.cost_cents == null
                            ? ""
                            : (record.cost_cents / 100).toFixed(2)
                        }
                      />
                    </label>
                  </p>
                  <p>
                    <label>
                      Total distance at service
                      {history.unit ? ` (${history.unit})` : ""}{" "}
                      <input
                        name="total_distance"
                        type="number"
                        min="0"
                        max="999999999.9"
                        step="0.1"
                        disabled={!history.unit}
                        defaultValue={record?.total_distance ?? ""}
                        aria-describedby="service-distance-help"
                      />
                    </label>
                  </p>
                  <p id="service-distance-help">
                    Leave blank if unknown. Use total distance including
                    previous odometers. Known distance requires a starting
                    mileage baseline on or before the service date.
                  </p>
                  <p>
                    <label>
                      Notes{" "}
                      <textarea
                        name="notes"
                        maxLength={4000}
                        defaultValue={record?.notes ?? ""}
                      />
                    </label>
                  </p>
                  <fieldset>
                    <legend>Maintenance schedules satisfied</legend>
                    <p>
                      Select only the work this service completed. Distance and
                      combined schedules require valid total distance. Older
                      service cannot overwrite later maintenance.
                    </p>
                    {items
                      .filter(
                        (item) =>
                          (item.enabled && !item.paused) ||
                          record?.schedule_ids.includes(item.id),
                      )
                      .map((item) => (
                        <p key={item.id}>
                          <label>
                            <input
                              type="checkbox"
                              name="schedule_ids"
                              value={item.id}
                              defaultChecked={
                                record?.schedule_ids.includes(item.id) ?? false
                              }
                            />{" "}
                            {item.name}
                            {!item.enabled || item.paused
                              ? " (paused or disabled; remove to change service effects)"
                              : ""}
                          </label>
                        </p>
                      ))}
                    {!items.length && <p>No maintenance schedules assigned.</p>}
                  </fieldset>
                </>
              )}
              {record && (
                <p>
                  <label>
                    Reason for change{" "}
                    <textarea name="reason" required maxLength={2000} />
                  </label>
                </p>
              )}
              <button type="submit">
                {pending
                  ? "Saving…"
                  : voiding
                    ? "Confirm void"
                    : "Save service"}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <h2>Completed service</h2>
      {!history.records.length && <p>No service records yet.</p>}
      {history.records.map((row) => (
        <section key={row.id} aria-label={row.title}>
          <h3>
            {row.title}
            {row.voided ? " — voided" : ""}
          </h3>
          <ServiceDetails record={row} />
          {row.mileage_inconsistent && (
            <p role="alert">
              Mileage needs review: this service’s recorded total distance
              conflicts with current meter history. The original value and
              maintenance effects have been preserved.
            </p>
          )}
          {row.schedule_ids.length > 0 && (
            <p>
              Satisfies:{" "}
              {row.schedule_ids
                .map(
                  (id) =>
                    items.find((i) => i.id === id)?.name ??
                    "Maintenance schedule",
                )
                .join(", ")}
            </p>
          )}
          {canManage && !row.voided && (
            <p>
              <button
                disabled={pending}
                onClick={() => setSelection({ record: row, voiding: false })}
              >
                Edit service
              </button>{" "}
              <button
                disabled={pending}
                onClick={() => setSelection({ record: row, voiding: true })}
              >
                Void service
              </button>
            </p>
          )}
          <details>
            <summary>Change history and schedule effects</summary>
            {history.revisions
              .filter((revision) => revision.service_id === row.id)
              .map((revision) => (
                <div key={revision.id}>
                  <h4>
                    Revision {revision.version}: {revision.snapshot.title}
                    {revision.snapshot.voided ? " — voided" : ""}
                  </h4>
                  <p>
                    {revision.recorded_at} · User {revision.actor_id}
                  </p>
                  {revision.reason && <p>Reason: {revision.reason}</p>}
                  <ServiceDetails record={revision.snapshot} />
                  {history.effects
                    .filter((effect) => effect.revision_id === revision.id)
                    .map((effect) => (
                      <p key={effect.id}>
                        {effect.schedule_name} —{" "}
                        {effect.reversal_of ? "Reversed" : "Applied"}.
                        {effect.distance_interval !== null && (
                          <>
                            {" "}
                            Distance target: {effect.before_usage} →{" "}
                            {effect.after_usage}{" "}
                            {revision.snapshot.distance_unit ??
                              row.distance_unit}
                            . Interval: {effect.distance_interval}.
                          </>
                        )}
                        {effect.time_interval !== null && (
                          <>
                            {" "}
                            Date target: {effect.before_date} →{" "}
                            {effect.after_date}. Interval:{" "}
                            {effect.time_interval} {effect.time_unit}.
                          </>
                        )}
                      </p>
                    ))}
                </div>
              ))}
          </details>
        </section>
      ))}
    </>
  );
}
