import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVehicles } from "@/modules/assets/queries";
import VehicleForm from "../vehicle-form";
import ArchiveButton from "../archive-button";

export const dynamic = "force-dynamic";
export default async function VehiclePage({
  params,
}: {
  params: Promise<{ organizationId: string; assetId: string }>;
}) {
  const { organizationId, assetId } = await params;
  const result = await getVehicles(organizationId, { assetId });
  if (result.status === 401) redirect("/auth");
  if (result.status === 404 || result.status === 400) notFound();
  if (!result.data)
    return (
      <main>
        <p role="alert">{result.error}</p>
      </main>
    );
  const vehicle = result.data.vehicles[0];
  return (
    <main>
      <p>
        <Link
          href={`/organizations/${organizationId}/vehicles${vehicle.archived_at ? "?archived=true" : ""}`}
        >
          Vehicles
        </Link>
      </p>
      <h1>{vehicle.name}</h1>
      {vehicle.archived_at && <p>Archived — read-only</p>}
      <dl>
        <dt>Status</dt>
        <dd>{vehicle.status === "active" ? "Active" : "Out of service"}</dd>
        {(
          [
            ["make", "Make"],
            ["model", "Model"],
            ["year", "Year"],
            ["vin", "VIN"],
            ["plate", "License plate"],
            ["jurisdiction", "Plate jurisdiction"],
            ["description", "Description"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {vehicle[key] ?? "Not provided"}
            </dd>
          </div>
        ))}
      </dl>
      {result.data.canManage && !vehicle.archived_at && (
        <>
          <VehicleForm
            key={vehicle.id + JSON.stringify(vehicle)}
            organizationId={organizationId}
            vehicle={vehicle}
          />
          <ArchiveButton organizationId={organizationId} assetId={assetId} />
        </>
      )}
    </main>
  );
}
