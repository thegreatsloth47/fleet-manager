import { resolveOrganizationPage } from "@/modules/organizations/page-access";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMileage } from "@/modules/meters/service";
import MileagePanel from "./mileage-panel";

export const dynamic = "force-dynamic";
export default async function MileagePage({
  params,
}: {
  params: Promise<{ organizationSlug: string; assetId: string }>;
}) {
  const { organizationSlug, assetId } = await params;
  const organizationId = await resolveOrganizationPage(organizationSlug);
  const result = await getMileage(organizationId, assetId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 400 || result.status === 404) notFound();
  return (
    <main>
      <p>
        <Link href={`/${organizationSlug}/vehicles/${assetId}`}>
          Vehicle details
        </Link>
        {" · "}
        <Link href={`/${organizationSlug}/vehicles/${assetId}/maintenance`}>
          Maintenance schedules
        </Link>
        {" · "}
        <Link href={`/${organizationSlug}/dashboard`}>Dashboard</Link>
        {" · "}
        <Link href={`/${organizationSlug}/vehicles`}>Vehicles</Link>
        {" · "}
        <Link href="/auth">Account</Link>
      </p>
      <h1>
        {result.data ? `${result.data.vehicleName} — Mileage` : "Mileage"}
      </h1>
      {result.data ? (
        <MileagePanel
          organizationId={organizationId}
          assetId={assetId}
          {...result.data}
        />
      ) : (
        <p role="alert">{result.error}</p>
      )}
    </main>
  );
}
