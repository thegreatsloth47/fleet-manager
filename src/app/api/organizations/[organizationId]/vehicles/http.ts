import { NextResponse } from "next/server";
import type { AssetResult } from "@/modules/assets/vehicle";

export type VehicleRouteContext = {
  params: Promise<{ organizationId: string; assetId: string }>;
};

export function respond<T>(result: AssetResult<T>) {
  return NextResponse.json(result.data ?? { error: result.error }, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function readMutation(
  request: Request,
): Promise<AssetResult<unknown>> {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return { status: 403, error: "Invalid request origin." };
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return { status: 400, error: "Expected JSON." };
  }
  try {
    return { status: 200, data: await request.json() };
  } catch {
    return { status: 400, error: "Invalid JSON." };
  }
}
