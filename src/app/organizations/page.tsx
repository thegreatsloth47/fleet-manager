import { redirect } from "next/navigation";
import { getAccessibleOrganizations } from "@/modules/organizations/queries";
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
            <li key={organization.id}>{organization.name}</li>
          ))}
        </ul>
      ) : (
        <p>You have no active organization memberships.</p>
      )}
      <CreateOrganizationForm />
      <p>
        <a href="/auth">Account and sign out</a>
      </p>
    </main>
  );
}
