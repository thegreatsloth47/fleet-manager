import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVehicles } from "@/modules/assets/queries";

export const dynamic = "force-dynamic";

export default async function VehiclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { organizationId } = await params;
  const archived = (await searchParams).archived === "true";
  const result = await getVehicles(organizationId, { archived });
  if (result.status === 401) redirect("/auth");
  if (result.status === 404 || result.status === 400) notFound();
  const path = `/organizations/${organizationId}/vehicles`;
  return (
    <main>
      <p>
        <Link href="/organizations">Organizations</Link>
      </p>
      <h1>{archived ? "Archived vehicles" : "Vehicles"}</h1>
      <p>
        <Link href={archived ? path : `${path}?archived=true`}>
          {archived ? "View current vehicles" : "View archived vehicles"}
        </Link>
      </p>
      {!result.data ? (
        <p role="alert">{result.error}</p>
      ) : (
        <>
          {result.data.canManage && (
            <p>
              <Link href={`${path}/new`}>Add vehicle</Link>
            </p>
          )}
          {result.data.vehicles.length ? (
            <ul>
              {result.data.vehicles.map((v) => (
                <li key={v.id}>
                  <Link href={`${path}/${v.id}`}>{v.name}</Link> —{" "}
                  {v.status === "active" ? "Active" : "Out of service"}
                </li>
              ))}
            </ul>
          ) : (
            <p>{archived ? "No archived vehicles." : "No vehicles yet."}</p>
          )}
        </>
      )}
    </main>
  );
}
