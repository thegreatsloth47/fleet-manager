import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMaintenance } from "@/modules/maintenance/service";
import MaintenanceForm from "../../../maintenance/maintenance-form";
import MaintenanceStatus from "../../../maintenance/maintenance-status";
export const dynamic = "force-dynamic";
export default async function VehicleMaintenancePage({
  params,
}: {
  params: Promise<{ organizationId: string; assetId: string }>;
}) {
  const { organizationId, assetId } = await params;
  const result = await getMaintenance(organizationId, assetId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 400 || result.status === 404) notFound();
  if (!result.data)
    return (
      <main>
        <p role="alert">{result.error}</p>
      </main>
    );
  const { items, templates, canManage, warnings } = result.data;
  const available = templates.filter(
    (t) => t.enabled && !items.some((i) => i.template_id === t.id),
  );
  return (
    <main>
      <p>
        <Link href={`/organizations/${organizationId}/vehicles/${assetId}`}>
          Vehicle details
        </Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/dashboard`}>
          Dashboard
        </Link>
        {" · "}
        <Link
          href={`/organizations/${organizationId}/maintenance?vehicle=${assetId}`}
        >
          Maintenance templates
        </Link>
        {" · "}
        <Link
          href={`/organizations/${organizationId}/vehicles/${assetId}/mileage`}
        >
          Mileage
        </Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/vehicles`}>Vehicles</Link>
        {" · "}
        <Link href="/auth">Account</Link>
      </p>
      <h1>{result.data.vehicleName} — Maintenance schedules</h1>
      {!canManage && <p>Maintenance is read-only.</p>}
      {warnings
        .filter((w) => w.page === "mileage")
        .map((w) => (
          <p key={w.message}>{w.message}</p>
        ))}
      {!items.length && <p>No maintenance schedules assigned.</p>}
      {items.map((item) => (
        <section key={item.id}>
          <h2>{item.name}</h2>
          <MaintenanceStatus item={item} />
          {canManage && (
            <details>
              <summary>Edit schedule</summary>
              <MaintenanceForm
                key={`${item.id}-${item.version}`}
                organizationId={organizationId}
                assetId={assetId}
                assignment={item}
              />
            </details>
          )}
        </section>
      ))}
      {canManage &&
        (available.length ? (
          <MaintenanceForm
            key={available.map((t) => `${t.id}-${t.version}`).join()}
            organizationId={organizationId}
            assetId={assetId}
            templates={available}
          />
        ) : (
          <p>
            <Link
              href={`/organizations/${organizationId}/maintenance?vehicle=${assetId}#new-template`}
            >
              Create a maintenance template
            </Link>{" "}
            to add another schedule, or{" "}
            <Link
              href={`/organizations/${organizationId}/maintenance?vehicle=${assetId}`}
            >
              enable an existing template
            </Link>
            .
          </p>
        ))}
    </main>
  );
}
