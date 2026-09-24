import { getVehicles } from "@/modules/assets/queries";
import { saveVehicle } from "@/modules/assets/commands";
import { readMutation, respond, type VehicleRouteContext } from "../http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: VehicleRouteContext) {
  const { organizationId, assetId } = await context.params;
  return respond(await getVehicles(organizationId, { assetId }));
}

export async function PUT(request: Request, context: VehicleRouteContext) {
  const input = await readMutation(request);
  if (input.error !== undefined) return respond(input);
  const { organizationId, assetId } = await context.params;
  return respond(await saveVehicle(organizationId, assetId, input.data));
}
