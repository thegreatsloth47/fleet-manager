import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMaintenance } from "@/modules/maintenance/service";
import MaintenanceForm from "./maintenance-form";
export const dynamic = "force-dynamic";
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
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
  return (
    <main>
      <p>
        <Link href={`/organizations/${organizationId}/dashboard`}>
          Maintenance dashboard
        </Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/vehicles`}>Vehicles</Link>
      </p>
      <h1>Maintenance templates</h1>
      <p>
        Reusable service intervals. Assign a template from a vehicle’s
        maintenance page. Template edits apply to future assignments; existing
        schedules keep their settings. Disabling a template suppresses all
        linked alerts without changing their targets.
      </p>
      {!result.data.canManage && <p>Maintenance is read-only.</p>}
      {result.data.canManage && (
        <MaintenanceForm organizationId={organizationId} />
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
