import "server-only";
import { authorizeVehicles } from "@/modules/assets/access";
import {
  maintenanceState,
  organizationDate,
  parseMaintenance,
  urgency,
  validId,
  type Assignment,
  type MaintenanceResult,
  type Template,
} from "./maintenance";

export type MaintenanceItem = Assignment &
  ReturnType<typeof maintenanceState> & {
    vehicleName: string;
    archived: boolean;
    enabled: boolean;
    usage: string | null;
    observedAt: string | null;
  };
export type MaintenanceOverview = {
  templates: Template[];
  items: MaintenanceItem[];
  alerts: MaintenanceItem[];
  warnings: { assetId: string; name: string; message: string }[];
  canManage: boolean;
  today: string;
  vehicleName?: string;
};

export async function getMaintenance(
  organizationId: string,
  assetId?: string,
): Promise<MaintenanceResult<MaintenanceOverview>> {
  // Maintenance intentionally has the same owner/admin/read-only boundary as assets.
  const access = await authorizeVehicles(organizationId);
  if (!access.data) return access;
  if (assetId && !validId(assetId))
    return { status: 400, error: "Invalid vehicle ID." };
  const db = access.data.supabase;
  const [templates, assignments, assets, usage, organization] =
    await Promise.all([
      db
        .from("maintenance_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name"),
      db
        .from("maintenance_assignments")
        .select("*")
        .eq("organization_id", organizationId),
      db
        .from("assets")
        .select("id,name,archived_at")
        .eq("organization_id", organizationId)
        .eq("asset_type", "vehicle"),
      db.rpc("maintenance_usage", { target_organization_id: organizationId }),
      db
        .from("organizations")
        .select("timezone")
        .eq("id", organizationId)
        .single(),
    ]);
  if (
    templates.error ||
    assignments.error ||
    assets.error ||
    usage.error ||
    organization.error ||
    !templates.data ||
    !assignments.data ||
    !assets.data ||
    !usage.data ||
    !organization.data
  )
    return { status: 500, error: "Unable to load maintenance." };
  const vehicle = assetId
    ? assets.data.find((a) => a.id === assetId)
    : undefined;
  if (assetId && !vehicle) return { status: 404, error: "Vehicle not found." };
  let today: string;
  try {
    today = organizationDate(new Date(), organization.data.timezone);
  } catch {
    return {
      status: 500,
      error: "Unable to evaluate the organization's calendar date.",
    };
  }
  const items: MaintenanceItem[] = [];
  for (const assignment of assignments.data) {
    if (assetId && assignment.asset_id !== assetId) continue;
    const asset = assets.data.find((a) => a.id === assignment.asset_id);
    const template = templates.data.find(
      (t) => t.id === assignment.template_id,
    );
    if (!asset || !template)
      return {
        status: 500,
        error: "Unable to load maintenance relationships.",
      };
    const meter = usage.data.find((m) => m.asset_id === asset.id);
    items.push({
      ...assignment,
      ...maintenanceState(assignment, meter?.accumulated ?? null, today),
      vehicleName: asset.name,
      archived: !!asset.archived_at,
      enabled: template.enabled,
      usage: meter?.accumulated ?? null,
      observedAt: meter?.observed_at ?? null,
    });
  }
  const alerts = items
    .filter(
      (i) => !i.archived && i.enabled && !i.paused && i.status !== "Not due",
    )
    .sort(
      (a, b) =>
        urgency[b.status] - urgency[a.status] ||
        a.vehicleName.localeCompare(b.vehicleName) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  const warnings: MaintenanceOverview["warnings"] = [];
  for (const asset of assets.data.filter(
    (a) => !a.archived_at && (!assetId || a.id === assetId),
  )) {
    if (!usage.data.some((m) => m.asset_id === asset.id))
      warnings.push({
        assetId: asset.id,
        name: asset.name,
        message:
          "Mileage not initialized. Calendar maintenance can still be tracked.",
      });
    if (!assignments.data.some((a) => a.asset_id === asset.id))
      warnings.push({
        assetId: asset.id,
        name: asset.name,
        message: "No maintenance schedules assigned.",
      });
  }
  return {
    status: 200,
    data: {
      templates: templates.data,
      items,
      alerts,
      warnings,
      canManage: access.data.canManage && !vehicle?.archived_at,
      today,
      vehicleName: vehicle?.name,
    },
  };
}

export async function saveMaintenance(
  organizationId: string,
  assetId: string | null,
  input: unknown,
): Promise<MaintenanceResult<{ id: string }>> {
  const access = await authorizeVehicles(organizationId, true);
  if (!access.data) return access;
  if (assetId !== null && !validId(assetId))
    return { status: 400, error: "Invalid vehicle ID." };
  const parsed = parseMaintenance(input, assetId !== null);
  if (!parsed.data) return parsed;
  const db = access.data.supabase;
  const { data, error } = await db.rpc("save_maintenance", {
    target_organization_id: organizationId,
    target_asset_id: assetId,
    payload: parsed.data,
  });
  if (error) {
    if (error.code === "42501")
      return { status: 403, error: "Maintenance management access required." };
    if (error.code === "P0002")
      return {
        status: 404,
        error: "Vehicle, template, or assignment not found.",
      };
    if (["40001", "23505"].includes(error.code))
      return {
        status: 409,
        error:
          "This schedule already exists or maintenance changed. Reload before saving.",
      };
    if (error.code === "55000")
      return {
        status: 409,
        error:
          "Archived vehicles are read-only and disabled templates cannot be assigned.",
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
          "Invalid maintenance details. Check intervals, windows, explicit targets, and initialized mileage with a matching unit.",
      };
    return { status: 500, error: "Unable to save maintenance." };
  }
  if (!data) return { status: 500, error: "Unable to save maintenance." };
  return {
    status: parsed.data.expected_version === 0 ? 201 : 200,
    data: { id: data },
  };
}
