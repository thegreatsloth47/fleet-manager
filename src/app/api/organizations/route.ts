import { NextResponse } from "next/server";
import { getAccessibleOrganizations } from "@/modules/organizations/queries";
import { createOrganization } from "@/modules/organizations/commands";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  // This endpoint uses browser session cookies; reject cross-origin mutations.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return NextResponse.json(
      { error: "Expected JSON." },
      { status: 415, headers },
    );
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON." },
      { status: 400, headers },
    );
  }
  const result = await createOrganization(input);
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get(
    "organization_id",
  );
  if (
    organizationId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    return NextResponse.json(
      { error: "organization_id must be a UUID." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const result = await getAccessibleOrganizations(
    organizationId?.toLowerCase(),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
