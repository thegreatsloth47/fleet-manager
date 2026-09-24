import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Existing FleetFalcon development data is protected even if a caller mislabels
// its project as E2E. Add future customer-facing projects to the protected list.
export const existingDevelopmentProject = "kgmxzjnqowsishsiyjug";
const projectRef = /^[a-z]{20}$/;

/** @param {Record<string, string | undefined>} values */
export function validateTarget(values) {
  const project = values.E2E_SUPABASE_PROJECT_REF;
  if (
    values.E2E_TARGET_ENVIRONMENT !== "isolated-e2e" ||
    !project ||
    !projectRef.test(project)
  )
    throw new Error(
      "Configure an explicitly approved isolated-e2e environment and E2E_SUPABASE_PROJECT_REF.",
    );
  const protectedRefs = values.E2E_PROTECTED_PROJECT_REFS?.split(",").map(
    (value) => value.trim(),
  );
  if (
    !protectedRefs?.length ||
    protectedRefs.some((value) => !projectRef.test(value))
  )
    throw new Error(
      "E2E_PROTECTED_PROJECT_REFS must list existing development and any production project refs.",
    );
  if (project === existingDevelopmentProject || protectedRefs.includes(project))
    throw new Error(
      "Fixture operations are blocked against existing development and production projects.",
    );
  const url = values.E2E_SUPABASE_URL;
  if (url !== `https://${project}.supabase.co`)
    throw new Error(
      "E2E_SUPABASE_URL must exactly match the approved isolated project.",
    );
  const publishableKey = values.E2E_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey?.startsWith("sb_publishable_"))
    throw new Error(
      "Configure the isolated project E2E_SUPABASE_PUBLISHABLE_KEY.",
    );
  return { project, url, publishableKey };
}

export function publicConfiguration() {
  // Deliberately never fall back to the application's development credentials.
  return validateTarget({
    ...fileEnvironment(".env.e2e.local"),
    ...process.env,
  });
}

export function configuration() {
  const values = { ...fileEnvironment(".env.e2e.local"), ...process.env };
  const target = validateTarget(values);
  const adminKey = values.E2E_SUPABASE_ADMIN_KEY;
  if (
    !adminKey ||
    !(adminKey.startsWith("sb_secret_") || adminKey.startsWith("eyJ"))
  )
    throw new Error(
      "Configure E2E_SUPABASE_ADMIN_KEY for the isolated project in .env.e2e.local or a protected CI environment secret.",
    );
  if (
    Object.entries(values).some(
      ([name, value]) => name.startsWith("NEXT_PUBLIC_") && value === adminKey,
    )
  )
    throw new Error(
      "The admin credential must never be a NEXT_PUBLIC variable.",
    );
  for (const file of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
  ]) {
    if (Object.values(fileEnvironment(file)).includes(adminKey))
      throw new Error(
        "Remove the fixture-admin credential from Next.js environment files; use only .env.e2e.local.",
      );
  }
  if (adminKey.startsWith("eyJ")) {
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(adminKey.split(".")[1], "base64url").toString(),
      );
    } catch {
      throw new Error("Invalid legacy admin credential.");
    }
    if (claims.role !== "service_role" || claims.ref !== target.project)
      throw new Error(
        "Legacy credential is not the isolated project service role.",
      );
  }
  return { ...target, adminKey };
}

/** @param {string} path */
function fileEnvironment(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

// Neither the browser nor Next.js inherits the test process's privileged secrets.
/** @param {Record<string, string | undefined>} [source] */
export function safeProcessEnvironment(source = process.env) {
  /** @type {Record<string,string>} */
  const env = {};
  for (const name of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TMP",
    "TEMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "PLAYWRIGHT_BROWSERS_PATH",
  ])
    if (source[name]) env[name] = source[name];
  return env;
}

export function publicProcessEnvironment() {
  const target = publicConfiguration();
  return {
    ...safeProcessEnvironment(),
    NEXT_PUBLIC_SUPABASE_URL: target.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.publishableKey,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
