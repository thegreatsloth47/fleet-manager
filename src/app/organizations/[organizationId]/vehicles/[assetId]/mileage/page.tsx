import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMileage } from "@/modules/meters/service";
import MileagePanel from "./mileage-panel";

export const dynamic = "force-dynamic";
export default async function MileagePage({
  params,
}: {
  params: Promise<{ organizationId: string; assetId: string }>;
}) {
  const { organizationId, assetId } = await params;
  const result = await getMileage(organizationId, assetId);
  if (result.status === 401) redirect("/auth");
  if (result.status === 400 || result.status === 404) notFound();
  return (
    <main>
      <p>
        <Link href={`/organizations/${organizationId}/vehicles/${assetId}`}>
          Vehicle details
        </Link>
      </p>
      <h1>Mileage</h1>
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
