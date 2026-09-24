"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Vehicle } from "@/modules/assets/vehicle";

export default function VehicleForm({
  organizationId,
  vehicle,
}: {
  organizationId: string;
  vehicle?: Vehicle;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/organizations/${organizationId}/vehicles`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(form),
      year: form.get("year") ? Number(form.get("year")) : null,
    };
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api${path}${vehicle ? `/${vehicle.id}` : ""}`,
        {
          method: vehicle ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        router.replace("/auth");
        router.refresh();
        return;
      }
      const result: unknown = await response.json();
      if (!response.ok) {
        setMessage(
          typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Unable to save vehicle.",
        );
        return;
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("id" in result) ||
        typeof result.id !== "string"
      )
        throw new Error("Invalid response");
      router.push(`${path}/${result.id}`);
      router.refresh();
      setMessage("Vehicle saved.");
    } catch {
      setMessage(
        "The save could not be confirmed. Refresh the vehicle list before trying again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending}>
        <legend>{vehicle ? "Edit vehicle" : "Add vehicle"}</legend>
        <p>
          <label>
            Display name/number{" "}
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={vehicle?.name}
            />
          </label>
        </p>
        <p>
          <label>
            Status{" "}
            <select name="status" defaultValue={vehicle?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="out_of_service">Out of service</option>
            </select>
          </label>
        </p>
        {(
          [
            ["make", "Make"],
            ["model", "Model"],
            ["vin", "VIN"],
            ["plate", "License plate"],
            ["jurisdiction", "Plate jurisdiction"],
          ] as const
        ).map(([name, label]) => (
          <p key={name}>
            <label>
              {label}{" "}
              <input
                name={name}
                maxLength={100}
                defaultValue={vehicle?.[name] ?? ""}
              />
            </label>
          </p>
        ))}
        <p>
          <label>
            Year{" "}
            <input
              name="year"
              type="number"
              min={1}
              max={9999}
              step={1}
              defaultValue={vehicle?.year ?? ""}
            />
          </label>
        </p>
        <p>
          <label>
            Description{" "}
            <textarea
              name="description"
              maxLength={4000}
              defaultValue={vehicle?.description ?? ""}
            />
          </label>
        </p>
        <button>{pending ? "Saving…" : "Save vehicle"}</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
