import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getVehicles } from "@/modules/assets/queries";
import {
  parseMeterCommand,
  type MeterHistory,
  type MeterResult,
} from "./meter";

export async function getMileage(
  organizationId: string,
  assetId: string,
): Promise<
  MeterResult<{
    history: MeterHistory[];
    canManage: boolean;
    vehicleName: string;
  }>
> {
  const vehicle = await getVehicles(organizationId, { assetId });
  if (!vehicle.data) return vehicle;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meter_history", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
  });
  if (error || !data)
    return { status: 500, error: "Unable to load mileage history." };
  return {
    status: 200,
    data: {
      history: data,
      vehicleName: vehicle.data.vehicles[0].name,
      canManage:
        vehicle.data.canManage && !vehicle.data.vehicles[0].archived_at,
    },
  };
}

export async function recordMileage(
  organizationId: string,
  assetId: string,
  input: unknown,
): Promise<MeterResult<{ id: string }>> {
  const vehicle = await getVehicles(organizationId, { assetId });
  if (!vehicle.data) return vehicle;
  if (!vehicle.data.canManage)
    return { status: 403, error: "Mileage management access required." };
  if (vehicle.data.vehicles[0].archived_at)
    return { status: 409, error: "Archived vehicles are read-only." };
  const parsed = parseMeterCommand(input);
  if (!parsed.data) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_meter_command", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
    payload: parsed.data,
  });
  if (error) {
    if (error.code === "42501")
      return { status: 403, error: "Mileage management access required." };
    if (error.code === "P0002")
      return { status: 404, error: "Vehicle or reading not found." };
    if (["23505", "40001"].includes(error.code))
      return {
        status: 409,
        error:
          "History changed or this observation time is already used. Reload and review the history.",
      };
    if (error.code === "55000")
      return { status: 409, error: "Archived vehicles are read-only." };
    if (
      ["23514", "23502", "22023", "22P02", "22007", "22008"].includes(
        error.code,
      )
    )
      return {
        status: 400,
        error:
          "Invalid mileage history. Check neighboring readings, baseline values, replacement final reading, and observation time.",
      };
    return { status: 500, error: "Unable to record mileage." };
  }
  if (!data) return { status: 500, error: "Unable to record mileage." };
  return { status: 201, data: { id: data } };
}
