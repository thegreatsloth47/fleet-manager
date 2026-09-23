import "server-only";
import { authorizeVehicles } from "./access";
import { isUuid, type AssetResult, type Vehicle } from "./vehicle";

export async function getVehicles(
  organizationId: string,
  options: { assetId?: string; archived?: boolean } = {},
): Promise<AssetResult<{ vehicles: Vehicle[]; canManage: boolean }>> {
  const access = await authorizeVehicles(organizationId);
  if (!access.data) return access;
  if (options.assetId && !isUuid(options.assetId))
    return { status: 400, error: "Invalid vehicle ID." };
  let query = access.data.supabase
    .from("assets")
    .select(
      "id, organization_id, name, status, make, model, year, description, archived_at, vehicle_profiles!inner(vin, plate, jurisdiction)",
    )
    .eq("organization_id", organizationId)
    .eq("asset_type", "vehicle");
  if (options.assetId) query = query.eq("id", options.assetId);
  else
    query = options.archived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
  const { data, error } = await query.order("name");
  if (error) return { status: 500, error: "Unable to load vehicles." };
  if (options.assetId && !data.length)
    return { status: 404, error: "Vehicle not found." };
  const vehicles: Vehicle[] = [];
  for (const { vehicle_profiles: profile, ...asset } of data) {
    if (asset.status !== "active" && asset.status !== "out_of_service")
      return { status: 500, error: "Unable to load vehicles." };
    vehicles.push({ ...asset, status: asset.status, ...profile });
  }
  return { status: 200, data: { vehicles, canManage: access.data.canManage } };
}
