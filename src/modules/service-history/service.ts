import "server-only";
import { authorizeVehicles } from "@/modules/assets/access";
import {
  getMaintenance,
  type MaintenanceOverview,
} from "@/modules/maintenance/service";
import {
  validId,
  type MaintenanceResult,
} from "@/modules/maintenance/maintenance";
import {
  parseService,
  type ServiceRecord,
  type ServiceRevision,
  type ScheduleEffect,
} from "./service-history";

export type ServiceHistory = {
  records: (ServiceRecord & { mileage_inconsistent: boolean })[];
  revisions: ServiceRevision[];
  effects: ScheduleEffect[];
  maintenance: MaintenanceOverview;
  unit: string | null;
};
export async function getServiceHistory(
  organizationId: string,
  assetId: string,
): Promise<MaintenanceResult<ServiceHistory>> {
  const access = await authorizeVehicles(organizationId);
  if (!access.data) return access;
  if (!validId(assetId)) return { status: 400, error: "Invalid vehicle ID." };
  const maintenance = await getMaintenance(organizationId, assetId);
  if (!maintenance.data) return maintenance;
  const db = access.data.supabase;
  const [records, revisions, effects, reviews, meters] = await Promise.all([
    db
      .from("service_records")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .order("service_date", { ascending: false })
      .order("id"),
    db
      .from("service_revisions")
      .select(
        "id,organization_id,asset_id,service_id,version,snapshot,reason,actor_id,recorded_at",
      )
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .order("version"),
    db
      .from("service_schedule_effects")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .order("after_version"),
    db.rpc("service_mileage_reviews", {
      target_organization_id: organizationId,
      target_asset_id: assetId,
    }),
    db
      .from("meters")
      .select("unit")
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .maybeSingle(),
  ]);
  if (
    records.error ||
    revisions.error ||
    effects.error ||
    reviews.error ||
    meters.error ||
    !records.data ||
    !revisions.data ||
    !effects.data ||
    !reviews.data
  )
    return { status: 500, error: "Unable to load service history." };
  return {
    status: 200,
    data: {
      records: records.data.map((record) => ({
        ...record,
        mileage_inconsistent:
          reviews.data.find((r) => r.id === record.id)?.inconsistent ?? false,
      })),
      revisions: revisions.data,
      effects: effects.data,
      maintenance: maintenance.data,
      unit: meters.data?.unit ?? null,
    },
  };
}
export async function saveService(
  organizationId: string,
  assetId: string,
  input: unknown,
): Promise<MaintenanceResult<{ id: string }>> {
  const access = await authorizeVehicles(organizationId, true);
  if (!access.data) return access;
  if (!validId(assetId)) return { status: 400, error: "Invalid vehicle ID." };
  const parsed = parseService(input);
  if (!parsed.data) return parsed;
  const { data, error } = await access.data.supabase.rpc("save_service", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
    payload: parsed.data,
  });
  if (error) {
    if (error.code === "42501")
      return { status: 403, error: "Service management access required." };
    if (error.code === "P0002")
      return { status: 404, error: "Vehicle, service, or schedule not found." };
    if (["40001", "23505"].includes(error.code))
      return {
        status: 409,
        error:
          "Service or maintenance changed, or a later service/manual change prevents this effect. Reload and review. For a new historical record, save without selecting schedules.",
      };
    if (error.code === "55000")
      return {
        status: 409,
        error:
          "Archived vehicles are read-only. Paused or disabled schedules cannot be satisfied.",
      };
    if (
      [
        "23514",
        "23502",
        "23503",
        "22023",
        "22P02",
        "22007",
        "22008",
        "22003",
      ].includes(error.code)
    )
      return {
        status: 400,
        error:
          "Check the service details and surrounding mileage history. Distance and combined schedules require valid total distance and an established mileage baseline. Future service dates are not allowed.",
      };
    return { status: 500, error: "Unable to save service." };
  }
  return data
    ? {
        status: parsed.data.expected_version === 0 ? 201 : 200,
        data: { id: data },
      }
    : { status: 500, error: "Unable to save service." };
}
