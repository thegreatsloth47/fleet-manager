import { resolveOrganizationPage } from "@/modules/organizations/page-access";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authorizeVehicles } from "@/modules/assets/access";
import VehicleForm from "../vehicle-form";

export const dynamic = "force-dynamic";
export default async function NewVehiclePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const organizationId = await resolveOrganizationPage(organizationSlug);
  const access = await authorizeVehicles(organizationId, true);
  if (access.status === 401) redirect("/auth");
  if ([400, 403, 404].includes(access.status)) notFound();
  return (
    <main>
      <p>
        <Link href={`/${organizationSlug}/vehicles`}>Vehicles</Link>
        {" · "}
        <Link href={`/${organizationSlug}/dashboard`}>Dashboard</Link>
        {" · "}
        <Link href="/auth">Account</Link>
      </p>
      <h1>Add vehicle</h1>
      {access.error ? (
        <p role="alert">{access.error}</p>
      ) : (
        <VehicleForm
          organizationSlug={organizationSlug}
          organizationId={organizationId}
        />
      )}
    </main>
  );
}
