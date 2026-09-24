import { getMileage, recordMileage } from "@/modules/meters/service";
import { readMutation, respond, type VehicleRouteContext } from "../../http";

export async function GET(_request: Request, context: VehicleRouteContext) {
  const { organizationId, assetId } = await context.params;
  return respond(await getMileage(organizationId, assetId));
}

export async function POST(request: Request, context: VehicleRouteContext) {
  const body = await readMutation(request);
  if (body.error) return respond(body);
  const { organizationId, assetId } = await context.params;
  return respond(await recordMileage(organizationId, assetId, body.data));
}
