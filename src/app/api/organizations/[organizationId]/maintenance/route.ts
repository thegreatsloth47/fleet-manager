import { getMaintenance, saveMaintenance } from "@/modules/maintenance/service";
import { readMutation, respond } from "../vehicles/http";
type Context = { params: Promise<{ organizationId: string }> };
export async function GET(_request: Request, context: Context) {
  const { organizationId } = await context.params;
  return respond(await getMaintenance(organizationId));
}
export async function POST(request: Request, context: Context) {
  const body = await readMutation(request);
  if (body.error) return respond(body);
  const { organizationId } = await context.params;
  return respond(await saveMaintenance(organizationId, null, body.data));
}
