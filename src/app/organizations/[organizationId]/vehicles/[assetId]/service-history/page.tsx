import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServiceHistory } from "@/modules/service-history/service";
import ServicePanel from "./service-panel";
export const dynamic = "force-dynamic";
export default async function ServicePage({
  params,
}: {
  params: Promise<{ organizationId: string; assetId: string }>;
}) {
  const { organizationId, assetId } = await params;
  const result = await getServiceHistory(organizationId, assetId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 400 || result.status === 404) notFound();
  if (!result.data)
    return (
      <main>
        <p role="alert">{result.error}</p>
      </main>
    );
  const vehicle = `/organizations/${organizationId}/vehicles/${assetId}`;
  return (
    <main>
      <p>
        <Link href={vehicle}>Vehicle details</Link>
        {" · "}
        <Link href={`${vehicle}/maintenance`}>Maintenance schedules</Link>
        {" · "}
        <Link href={`${vehicle}/mileage`}>Mileage</Link>
      </p>
      <h1>{result.data.maintenance.vehicleName} — Service history</h1>
      <ServicePanel
        key={result.data.records.map((r) => `${r.id}-${r.version}`).join()}
        organizationId={organizationId}
        assetId={assetId}
        history={result.data}
      />
    </main>
  );
}
