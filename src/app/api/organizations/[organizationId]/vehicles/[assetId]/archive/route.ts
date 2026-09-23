import { archiveVehicle } from "@/modules/assets/commands";
import { readMutation, respond, type VehicleRouteContext } from "../../http";

export async function POST(request: Request, context: VehicleRouteContext) {
  const input = await readMutation(request);
  if (input.error !== undefined) return respond(input);
  if (
    typeof input.data !== "object" ||
    input.data === null ||
    Array.isArray(input.data) ||
    Object.keys(input.data).length
  ) {
    return respond({
      status: 400,
      error: "Archive expects an empty JSON object.",
    });
  }
  const { organizationId, assetId } = await context.params;
  return respond(await archiveVehicle(organizationId, assetId));
}
