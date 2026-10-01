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
        {" · "}
        <Link href="/auth">Account</Link>
      </p>
      <p>{result.data.organizationName}</p>
      <h1>Dashboard</h1>
      <p>
        Maintenance due as of {today}, using your organization’s local date and
        latest recorded mileage.
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
                href={`/organizations/${organizationId}/vehicles/${item.asset_id}`}
              >
                {item.vehicleName}
              </Link>
              {" — "}
              <Link
                href={`/organizations/${organizationId}/vehicles/${item.asset_id}/maintenance`}
              >
                {item.name}
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
                  href={`/organizations/${organizationId}/vehicles/${w.assetId}/${w.page}`}
                >
                  {w.name} —{" "}
                  {w.page === "mileage"
                    ? result.data!.canManage
                      ? "Record starting mileage"
                      : "View mileage"
                    : result.data!.canManage
                      ? "Add schedule"
                      : "View maintenance schedules"}
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
