import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVehicles } from "@/modules/assets/queries";
import { getMaintenance } from "@/modules/maintenance/service";
import MaintenanceForm from "./maintenance-form";
export const dynamic = "force-dynamic";
export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams?: Promise<{ vehicle?: string }>;
}) {
  const { organizationId } = await params;
  const result = await getMaintenance(organizationId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 404 || result.status === 400) notFound();
  if (!result.data)
    return (
      <main>
        <p role="alert">{result.error}</p>
      </main>
    );
  const vehicleId = (await searchParams)?.vehicle;
  const vehicleResult = vehicleId
    ? await getVehicles(organizationId, { assetId: vehicleId })
    : undefined;
  if (vehicleResult?.status === 401) redirect("/auth");
  if (vehicleResult?.status === 400 || vehicleResult?.status === 404)
    notFound();
  if (vehicleResult?.error)
    return (
      <main>
        <p role="alert">{vehicleResult.error}</p>
      </main>
    );
  const vehicle = vehicleResult?.data?.vehicles[0];
  return (
    <main>
      <p>
        <Link href="/organizations">Organizations</Link>
        {" · "}
        <Link href="/auth">Account</Link>
      </p>
      <p>
        <Link href={`/organizations/${organizationId}/dashboard`}>
          Dashboard
        </Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/vehicles`}>Vehicles</Link>
      </p>
      <p>{result.data.organizationName}</p>
      <h1>Maintenance templates</h1>
      {vehicle && (
        <p>
          <Link
            href={`/organizations/${organizationId}/vehicles/${vehicle.id}/maintenance`}
          >
            Back to {vehicle.name} maintenance
          </Link>
        </p>
      )}
      <p>
        Set how often a service is needed, then add it to a vehicle’s
        maintenance schedules. Editing a template only changes schedules added
        later. Existing schedules keep their settings. Disabling a template
        hides alerts for its schedules without changing when service is due.
      </p>
      {!result.data.canManage && <p>Maintenance is read-only.</p>}
      {result.data.canManage && (
        <section id="new-template">
          <MaintenanceForm organizationId={organizationId} />
        </section>
      )}
      {!result.data.templates.length && <p>No maintenance templates yet.</p>}
      {result.data.templates.map((t) => (
        <section key={t.id}>
          <h2>{t.name}</h2>
          <p>{t.enabled ? "Enabled" : "Disabled"}</p>
          <p>
            {t.distance_interval !== null &&
              `Every ${t.distance_interval} ${t.distance_unit}. `}
            {t.time_interval !== null &&
              `Every ${t.time_interval} ${t.time_unit}. `}
            Upcoming {t.upcoming_percent}%; due {t.due_percent}%.
          </p>
          {result.data!.canManage && (
            <details>
              <summary>Edit template</summary>
              <MaintenanceForm
                key={`${t.id}-${t.version}`}
                organizationId={organizationId}
                template={t}
              />
            </details>
          )}
        </section>
      ))}
    </main>
  );
}
