import {
  getServiceHistory,
  saveService,
} from "@/modules/service-history/service";
import { readMutation, respond, type VehicleRouteContext } from "../../http";
export async function GET(_request: Request, context: VehicleRouteContext) {
  const { organizationId, assetId } = await context.params;
  return respond(await getServiceHistory(organizationId, assetId));
}
export async function POST(request: Request, context: VehicleRouteContext) {
  const body = await readMutation(request);
  if (body.error) return respond(body);
  const { organizationId, assetId } = await context.params;
  return respond(await saveService(organizationId, assetId, body.data));
}
