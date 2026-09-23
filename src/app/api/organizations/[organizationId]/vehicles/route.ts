import { getVehicles } from "@/modules/assets/queries";
import { saveVehicle } from "@/modules/assets/commands";
import { readMutation, respond } from "./http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: Context) {
  const { organizationId } = await context.params;
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return respond(await getVehicles(organizationId, { archived }));
}

export async function POST(request: Request, context: Context) {
  const input = await readMutation(request);
  if (input.error !== undefined) return respond(input);
  const { organizationId } = await context.params;
  return respond(await saveVehicle(organizationId, null, input.data));
}
