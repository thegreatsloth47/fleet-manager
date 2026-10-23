import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAccessibleOrganizations } from "./queries";

// Slugs locate organizations; active membership still determines access.
export async function resolveOrganizationPage(slug: string): Promise<string> {
  const result = await getAccessibleOrganizations();
  if (result.status === 401) redirect("/auth");
  if (result.status !== 200) throw new Error("Unable to load organizations.");
  const organization = result.body.organizations?.find(
    (org) => org.slug === slug,
  );
  if (!organization) notFound();
  return organization.id;
}
