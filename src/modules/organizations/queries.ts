import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getAccessibleOrganizations(organizationId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: 401, body: { error: "Authentication required." } };
  }

  // Resolve scope from current database membership, never client or JWT metadata.
  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    return { status: 500, body: { error: "Unable to load organizations." } };
  }
  const organizationIds = memberships.map(
    (membership) => membership.organization_id,
  );
  if (organizationId && !organizationIds.includes(organizationId)) {
    // The same response for missing and inaccessible IDs avoids existence disclosure.
    return { status: 404, body: { error: "Organization not found." } };
  }
  if (organizationIds.length === 0) {
    return { status: 200, body: { organizations: [] } };
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, status, timezone, created_at")
    .in("id", organizationId ? [organizationId] : organizationIds)
    .order("name");

  if (error) {
    return { status: 500, body: { error: "Unable to load organizations." } };
  }
  if (organizationId && data.length === 0) {
    return { status: 404, body: { error: "Organization not found." } };
  }
  return {
    status: 200,
    body: {
      organizations: data.map((organization) => ({
        ...organization,
        role: memberships.find(
          (membership) => membership.organization_id === organization.id,
        )?.role,
      })),
    },
  };
}
