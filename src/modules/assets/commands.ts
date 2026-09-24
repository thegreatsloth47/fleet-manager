import "server-only";
import { authorizeVehicles } from "./access";
import { isUuid, parseVehicle, type AssetResult } from "./vehicle";

function writeError(code: string): AssetResult<{ id: string }> {
  if (code === "23505")
    return {
      status: 409,
      error:
        "A non-archived asset already uses this name, or a vehicle (including archived vehicles) already uses this VIN.",
    };
  if (code === "55000")
    return { status: 409, error: "Archived vehicles are read-only." };
  if (code === "P0002") return { status: 404, error: "Vehicle not found." };
  if (code === "42501")
    return { status: 403, error: "Vehicle management access required." };
  if (["23514", "23502", "22023"].includes(code))
    return { status: 400, error: "Invalid vehicle details." };
  return { status: 500, error: "Unable to save vehicle." };
}

export async function saveVehicle(
  organizationId: string,
  assetId: string | null,
  input: unknown,
): Promise<AssetResult<{ id: string }>> {
  const access = await authorizeVehicles(organizationId, true);
  if (!access.data) return access;
  if (assetId !== null && !isUuid(assetId))
    return { status: 400, error: "Invalid vehicle ID." };
  const parsed = parseVehicle(input);
  if (!parsed.data) return parsed;
  const v = parsed.data;
  const { data, error } = await access.data.supabase.rpc("save_vehicle", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
    vehicle_name: v.name,
    vehicle_status: v.status,
    vehicle_make: v.make,
    vehicle_model: v.model,
    vehicle_year: v.year,
    vehicle_description: v.description,
    vehicle_vin: v.vin,
    vehicle_plate: v.plate,
    vehicle_jurisdiction: v.jurisdiction,
  });
  if (error) return writeError(error.code);
  if (!data) return { status: 500, error: "Unable to save vehicle." };
  return { status: assetId ? 200 : 201, data: { id: data } };
}

export async function archiveVehicle(
  organizationId: string,
  assetId: string,
): Promise<AssetResult<{ id: string }>> {
  const access = await authorizeVehicles(organizationId, true);
  if (!access.data) return access;
  if (!isUuid(assetId)) return { status: 400, error: "Invalid vehicle ID." };
  const { data, error } = await access.data.supabase.rpc("archive_vehicle", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
  });
  if (error) return writeError(error.code);
  if (!data) return { status: 500, error: "Unable to archive vehicle." };
  return { status: 200, data: { id: data } };
}
