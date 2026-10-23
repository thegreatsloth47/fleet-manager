import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessibleOrganizations } from "@/modules/organizations/queries";
import { canViewVehicles } from "@/modules/assets/vehicle";
import CreateOrganizationForm from "./create-form";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const result = await getAccessibleOrganizations();
  if (result.status === 401) redirect("/auth");
  const organizations = result.body.organizations;

  return (
    <main>
      <h1>Your organizations</h1>
      {result.body.error ? (
        <p role="alert">{result.body.error}</p>
      ) : organizations?.length ? (
        <ul>
          {organizations.map((organization) => (
            <li key={organization.id}>
              {organization.name}
              {canViewVehicles(organization.role) && (
                <>
                  {" "}
                  —{" "}
                  <Link href={`/${organization.slug}/vehicles`}>Vehicles</Link>
                  {" · "}
                  <Link href={`/${organization.slug}/dashboard`}>
                    Dashboard
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>You do not have access to an organization yet.</p>
      )}
      <CreateOrganizationForm />
      <p>
        <Link href="/auth">Account</Link>
      </p>
    </main>
  );
}
