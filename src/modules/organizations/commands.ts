import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function createOrganization(input: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: 401, body: { error: "Authentication required." } };
  }
  if (
    typeof input !== "object" ||
    input === null ||
    !("name" in input) ||
    typeof input.name !== "string" ||
    Object.keys(input).some((key) => key !== "name")
  ) {
    return {
      status: 400,
      body: { error: "Provide only an organization name." },
    };
  }
  const name = input.name.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 200) {
    return {
      status: 400,
      body: { error: "Organization name must contain 1 to 200 characters." },
    };
  }

  const { data: id, error } = await supabase.rpc("create_organization", {
    organization_name: name,
  });
  if (error || !id) {
    return { status: 500, body: { error: "Unable to create organization." } };
  }
  return { status: 201, body: { organization: { id } } };
}
