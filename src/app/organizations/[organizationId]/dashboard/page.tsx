import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMaintenance } from "@/modules/maintenance/service";
import MaintenanceStatus from "../maintenance/maintenance-status";
export const dynamic = "force-dynamic";
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const result = await getMaintenance(organizationId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 400 || result.status === 404) notFound();
  if (!result.data)
    return (
      <main>
        <p role="alert">{result.error}</p>
      </main>
    );
  const { alerts, warnings, today } = result.data;
  return (
    <main>
      <p>
        <Link href="/organizations">Organizations</Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/vehicles`}>Vehicles</Link>
        {" · "}
        <Link href={`/organizations/${organizationId}/maintenance`}>
          Maintenance templates
        </Link>
      </p>
      <h1>Maintenance dashboard</h1>
      <p>
        As of {today} in your organization’s timezone. Based on recorded
        mileage; refresh to see new readings or a new calendar day.
      </p>
      <dl>
        {(["Overdue", "Due", "Upcoming"] as const).map((status) => (
          <div key={status}>
            <dt>{status}</dt>
            <dd>{alerts.filter((i) => i.status === status).length}</dd>
          </div>
        ))}
      </dl>
      <h2>Needs attention</h2>
      {!alerts.length && <p>No active maintenance alerts.</p>}
      <ol>
        {alerts.map((item) => (
          <li key={item.id}>
            <h3>
              <Link
                href={`/organizations/${organizationId}/vehicles/${item.asset_id}/maintenance`}
              >
                {item.vehicleName} — {item.name}
              </Link>
            </h3>
            <MaintenanceStatus item={item} />
          </li>
        ))}
      </ol>
      {!!warnings.length && (
        <section>
          <h2>Finish setup</h2>
          <ul>
            {warnings.map((w) => (
              <li key={`${w.assetId}-${w.message}`}>
                <Link
                  href={`/organizations/${organizationId}/vehicles/${w.assetId}/maintenance`}
                >
                  {w.name}
                </Link>
                : {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
