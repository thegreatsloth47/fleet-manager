import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authorizeVehicles } from "@/modules/assets/access";
import VehicleForm from "../vehicle-form";

export const dynamic = "force-dynamic";
export default async function NewVehiclePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const access = await authorizeVehicles(organizationId, true);
  if (access.status === 401) redirect("/auth");
  if ([400, 403, 404].includes(access.status)) notFound();
  return (
    <main>
      <p>
        <Link href={`/organizations/${organizationId}/vehicles`}>Vehicles</Link>
      </p>
      <h1>Add vehicle</h1>
      {access.error ? (
        <p role="alert">{access.error}</p>
      ) : (
        <VehicleForm organizationId={organizationId} />
      )}
    </main>
  );
}
