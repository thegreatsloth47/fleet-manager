import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canViewVehicles, isUuid, type AssetResult } from "./vehicle";

export async function authorizeVehicles(
  organizationId: string,
  write = false,
): Promise<
  AssetResult<{
    supabase: Awaited<ReturnType<typeof createClient>>;
    canManage: boolean;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { status: 401, error: "Authentication required." };
  if (!isUuid(organizationId))
    return { status: 400, error: "Invalid organization ID." };
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError)
    return { status: 500, error: "Unable to verify vehicle access." };
  if (!membership || !canViewVehicles(membership.role)) {
    return { status: 404, error: "Organization not found." };
  }
  const canManage = membership.role === "owner" || membership.role === "admin";
  if (write && !canManage)
    return { status: 403, error: "Vehicle management access required." };
  return { status: 200, data: { supabase, canManage } };
}
