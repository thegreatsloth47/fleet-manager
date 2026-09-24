import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { configuration } from "./environment.mjs";

export type TestUser = { id: string; email: string; password: string };
type UserRecord = Omit<TestUser, "password">;
type OrganizationRecord = { name: string; ownerId: string; id?: string };
type DeletionPlan = {
  organizationIds: string[];
  assetIds: string[];
  meterIds: string[];
  entryIds: string[];
  revisionIds: string[];
  memberships: { organization_id: string; user_id: string }[];
};
type Manifest = {
  version: 1;
  project: string;
  runId: string;
  fixtureId: string;
  users: UserRecord[];
  organizations: OrganizationRecord[];
  cleaned: boolean;
  deletionPlan?: DeletionPlan;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This client never leaves the Node fixture process. Browser helpers receive only
// ordinary test-user credentials and public IDs, never the client or its key.
export class Fixtures {
  private readonly config = configuration();
  private readonly client = createClient<Database>(
    this.config.url,
    this.config.adminKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  private readonly manifest: Manifest;
  private schemaVerified = false;
  readonly path: string;
  readonly prefix: string;

  constructor(runId: string, recoveryPath?: string) {
    if (!uuid.test(runId)) throw new Error("Invalid run UUID.");
    if (recoveryPath) {
      const parsed: unknown = JSON.parse(readFileSync(recoveryPath, "utf8"));
      if (
        !validManifest(parsed) ||
        parsed.runId !== runId ||
        parsed.project !== this.config.project
      )
        throw new Error(
          "Recovery manifest does not match the approved isolated E2E project/run.",
        );
      this.manifest = parsed;
      this.path = recoveryPath;
    } else {
      this.manifest = {
        version: 1,
        project: this.config.project,
        runId,
        fixtureId: randomUUID(),
        users: [],
        organizations: [],
        cleaned: false,
      };
      this.path = `.e2e-runs/${runId}/${this.manifest.fixtureId}.json`;
      this.persist();
    }
    this.prefix = `ff-e2e-${runId}-${this.manifest.fixtureId}`;
  }

  private persist() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify(this.manifest, null, 2), {
      mode: 0o600,
    });
    renameSync(temp, this.path);
  }

  async verifyProject() {
    const checked = configuration();
    if (
      checked.project !== this.manifest.project ||
      checked.url !== this.config.url
    )
      throw new Error("Project identity changed; refusing fixture operations.");
    // UUID-specific Auth read validates the admin credential against the approved
    // project without listing or inspecting existing customer accounts.
    const { error: authError } = await this.client.auth.admin.getUserById(
      "00000000-0000-4000-8000-000000000000",
    );
    if (authError && authError.status !== 404)
      throw new Error("Isolated E2E admin credential validation failed.");
    if (this.schemaVerified) return;
    for (const table of [
      "organizations",
      "memberships",
      "assets",
      "vehicle_profiles",
      "meters",
      "meter_entries",
      "meter_revisions",
    ] as const) {
      const { error } = await this.client.from(table).select("*").limit(0);
      if (error)
        throw new Error(
          `Isolated E2E schema preflight failed for ${table}. Review/apply the existing migrations; E2E never applies them.`,
        );
    }
    this.schemaVerified = true;
  }

  async user(label: string, confirmed = true): Promise<TestUser> {
    await this.verifyProject();
    const user = {
      id: randomUUID(),
      email: `ff-e2e-${this.manifest.runId.slice(0, 8)}-${this.manifest.fixtureId.slice(0, 8)}-${label}@example.com`,
      password: `Ff!${randomBytes(24).toString("base64url")}a9`,
    };
    this.manifest.users.push({ id: user.id, email: user.email });
    this.persist(); // Journal a chosen Auth UUID before its creation, including lost responses.
    const { data, error } = await this.client.auth.admin.createUser({
      ...user,
      email_confirm: confirmed,
      app_metadata: {
        fleetfalcon_e2e_run: this.manifest.runId,
        fleetfalcon_e2e_fixture: this.manifest.fixtureId,
      },
    });
    if (error || data.user?.id !== user.id)
      throw new Error(
        "Test account provisioning failed. See the recovery manifest; no credentials were logged.",
      );
    return user;
  }

  organizationIntent(owner: TestUser, label: string) {
    if (!this.manifest.users.some((user) => user.id === owner.id))
      throw new Error("Unknown fixture owner.");
    const organization = { name: `${this.prefix}-${label}`, ownerId: owner.id };
    this.manifest.organizations.push(organization);
    this.persist();
    return organization.name;
  }

  async registerOrganization(name: string, id: string) {
    const organization = this.manifest.organizations.find(
      (org) => org.name === name,
    );
    if (!organization || !uuid.test(id))
      throw new Error("Unrecognized fixture organization.");
    organization.id = id;
    this.persist();
    await this.verifyOrganization(organization);
  }

  private async verifyOrganization(organization: OrganizationRecord) {
    const { data, error } = await this.client
      .from("organizations")
      .select("id,name")
      .eq("name", organization.name);
    if (error || data.length > 1)
      throw new Error("Cannot uniquely identify fixture organization.");
    if (!data.length) return null;
    const org = data[0];
    if (organization.id && organization.id !== org.id)
      throw new Error("Fixture organization ID mismatch.");
    const { data: memberships, error: memberError } = await this.client
      .from("memberships")
      .select("user_id,role")
      .eq("organization_id", org.id);
    if (
      memberError ||
      (!this.manifest.deletionPlan &&
        !memberships.some(
          (m) => m.user_id === organization.ownerId && m.role === "owner",
        )) ||
      memberships.some(
        (m) => !this.manifest.users.some((user) => user.id === m.user_id),
      )
    )
      throw new Error(
        "Fixture ownership verification failed; refusing changes.",
      );
    organization.id = org.id;
    this.persist();
    return org.id;
  }

  async membership(
    organizationId: string,
    user: TestUser,
    role: "admin" | "read_only" | "driver",
    status: "active" | "revoked" = "active",
  ) {
    await this.verifyProject();
    const organization = this.manifest.organizations.find(
      (org) => org.id === organizationId,
    );
    if (
      !organization ||
      !this.manifest.users.some((item) => item.id === user.id)
    )
      throw new Error("Membership change is outside fixture scope.");
    await this.verifyOrganization(organization);
    const { error } = await this.client.from("memberships").upsert({
      organization_id: organizationId,
      user_id: user.id,
      role,
      status,
    });
    if (error) throw new Error("Fixture membership operation failed.");
  }

  async confirmation(user: TestUser) {
    await this.verifyProject();
    if (!this.manifest.users.some((item) => item.id === user.id))
      throw new Error("Unknown test account.");
    const { data, error } = await this.client.auth.admin.generateLink({
      type: "signup",
      email: user.email,
      password: user.password,
    });
    if (error || data.user?.id !== user.id || !data.properties?.hashed_token)
      throw new Error(
        "Unable to generate a confirmation link for the test account.",
      );
    return `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`;
  }

  async cleanup() {
    if (this.manifest.cleaned) return;
    await this.verifyProject();
    const userIds = this.manifest.users.map((user) => user.id);
    // Validate the complete fixture before the first delete. A foreign membership
    // or foreign audit actor stops cleanup rather than risking unrelated data.
    for (const user of this.manifest.users) {
      const { data, error } = await this.client.auth.admin.getUserById(user.id);
      if (error?.status === 404) continue;
      if (
        error ||
        data.user?.email !== user.email ||
        data.user.app_metadata.fleetfalcon_e2e_run !== this.manifest.runId ||
        data.user.app_metadata.fleetfalcon_e2e_fixture !==
          this.manifest.fixtureId
      )
        throw new Error("Auth fixture identity mismatch; cleanup stopped.");
    }
    const orgIds: string[] = [];
    for (const organization of this.manifest.organizations) {
      const id = await this.verifyOrganization(organization);
      if (id) orgIds.push(id);
    }
    if (userIds.length) {
      const { data: memberships, error } = await this.client
        .from("memberships")
        .select("organization_id")
        .in("user_id", userIds);
      if (
        error ||
        memberships.some((member) => !orgIds.includes(member.organization_id))
      )
        throw new Error(
          "A test account has a membership outside this fixture; cleanup stopped.",
        );
    }
    if (orgIds.length) {
      const { data: assets, error } = await this.client
        .from("assets")
        .select("id,name")
        .in("organization_id", orgIds);
      if (error || assets.some((asset) => !asset.name.startsWith(this.prefix)))
        throw new Error(
          "Unexpected asset in fixture organization; cleanup stopped.",
        );
      const { data: meters, error: meterError } = await this.client
        .from("meters")
        .select("id,asset_id")
        .in("organization_id", orgIds);
      if (
        meterError ||
        meters.some(
          (meter) => !assets.some((asset) => asset.id === meter.asset_id),
        )
      )
        throw new Error(
          "Unexpected meter in fixture organization; cleanup stopped.",
        );
      const { data: entries, error: entryError } = await this.client
        .from("meter_entries")
        .select("id,actor_id,meter_id")
        .in("organization_id", orgIds);
      const { data: revisions, error: revisionError } = await this.client
        .from("meter_revisions")
        .select("id,actor_id,meter_id")
        .in("organization_id", orgIds);
      if (
        entryError ||
        revisionError ||
        [...entries, ...revisions].some(
          (row) =>
            !userIds.includes(row.actor_id) ||
            !meters.some((meter) => meter.id === row.meter_id),
        )
      )
        throw new Error("Unexpected meter audit evidence; cleanup stopped.");
      const { data: memberships, error: membershipError } = await this.client
        .from("memberships")
        .select("organization_id,user_id")
        .in("organization_id", orgIds);
      if (
        membershipError ||
        memberships.some((member) => !userIds.includes(member.user_id))
      )
        throw new Error("Unexpected membership; cleanup stopped.");
      const inventory: DeletionPlan = {
        organizationIds: orgIds,
        assetIds: assets.map((row) => row.id),
        meterIds: meters.map((row) => row.id),
        entryIds: entries.map((row) => row.id),
        revisionIds: revisions.map((row) => row.id),
        memberships,
      };
      if (this.manifest.deletionPlan) {
        const prior = this.manifest.deletionPlan;
        for (const key of [
          "organizationIds",
          "assetIds",
          "meterIds",
          "entryIds",
          "revisionIds",
        ] as const)
          if (inventory[key].some((id) => !prior[key].includes(id)))
            throw new Error(
              "Fixture changed after cleanup started; manual review required.",
            );
        if (
          memberships.some(
            (member) =>
              !prior.memberships.some(
                (old) =>
                  old.organization_id === member.organization_id &&
                  old.user_id === member.user_id,
              ),
          )
        )
          throw new Error(
            "Membership changed after cleanup started; manual review required.",
          );
      } else {
        this.manifest.deletionPlan = inventory;
        this.persist();
      }
      // Delete only snapshot IDs with the verified tenant predicate as a second
      // boundary. New or unrelated records are never swept up by recovery.
      const plan = this.manifest.deletionPlan;
      for (const [table, ids] of [
        ["meter_revisions", plan.revisionIds],
        ["meter_entries", plan.entryIds],
        ["meters", plan.meterIds],
      ] as const) {
        if (!ids.length) continue;
        const { error } = await this.client
          .from(table)
          .delete()
          .in("id", ids)
          .in("organization_id", orgIds);
        if (error)
          throw new Error(
            `Cleanup failed for ${table}; retain manifest and retry cleanup.`,
          );
      }
      if (plan.assetIds.length) {
        const { error: profileError } = await this.client
          .from("vehicle_profiles")
          .delete()
          .in("asset_id", plan.assetIds)
          .in("organization_id", orgIds);
        if (profileError)
          throw new Error("Vehicle profile cleanup failed; retain manifest.");
        const { error: assetError } = await this.client
          .from("assets")
          .delete()
          .in("id", plan.assetIds)
          .in("organization_id", orgIds);
        if (assetError)
          throw new Error("Asset cleanup failed; retain manifest.");
      }
      for (const member of plan.memberships) {
        const { error } = await this.client
          .from("memberships")
          .delete()
          .eq("organization_id", member.organization_id)
          .eq("user_id", member.user_id);
        if (error)
          throw new Error("Membership cleanup failed; retain manifest.");
      }
      const { error: organizationError } = await this.client
        .from("organizations")
        .delete()
        .in("id", orgIds);
      if (organizationError)
        throw new Error("Organization cleanup failed; retain manifest.");
    }
    for (const user of this.manifest.users) {
      const { error } = await this.client.auth.admin.deleteUser(user.id);
      if (error && error.status !== 404)
        throw new Error("Test account cleanup failed; retain manifest.");
    }
    this.manifest.cleaned = true;
    this.persist();
  }
}

export function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    typeof v.project !== "string" ||
    !/^[a-z]{20}$/.test(v.project) ||
    typeof v.runId !== "string" ||
    !uuid.test(v.runId) ||
    typeof v.fixtureId !== "string" ||
    !uuid.test(v.fixtureId) ||
    typeof v.cleaned !== "boolean" ||
    !Array.isArray(v.users) ||
    !Array.isArray(v.organizations)
  )
    return false;
  const prefix = `ff-e2e-${v.runId}-${v.fixtureId}-`;
  const emailPrefix = `ff-e2e-${v.runId.slice(0, 8)}-${v.fixtureId.slice(0, 8)}-`;
  const users: string[] = [];
  const orgIds: string[] = [];
  for (const u of v.users) {
    if (
      !u ||
      typeof u !== "object" ||
      !("id" in u) ||
      typeof u.id !== "string" ||
      !uuid.test(u.id) ||
      !("email" in u) ||
      typeof u.email !== "string" ||
      !u.email.startsWith(emailPrefix) ||
      !u.email.endsWith("@example.com")
    )
      return false;
    users.push(u.id);
  }
  for (const o of v.organizations) {
    if (
      !o ||
      typeof o !== "object" ||
      !("name" in o) ||
      typeof o.name !== "string" ||
      !o.name.startsWith(prefix) ||
      !("ownerId" in o) ||
      typeof o.ownerId !== "string" ||
      !users.includes(o.ownerId)
    )
      return false;
    if ("id" in o) {
      if (typeof o.id !== "string" || !uuid.test(o.id)) return false;
      orgIds.push(o.id);
    }
  }
  if (v.deletionPlan !== undefined) {
    const plan = v.deletionPlan;
    if (!plan || typeof plan !== "object") return false;
    for (const key of [
      "organizationIds",
      "assetIds",
      "meterIds",
      "entryIds",
      "revisionIds",
    ]) {
      const ids: unknown = Reflect.get(plan, key);
      if (
        !Array.isArray(ids) ||
        !ids.every((id) => typeof id === "string" && uuid.test(id))
      )
        return false;
      if (key === "organizationIds" && ids.some((id) => !orgIds.includes(id)))
        return false;
    }
    const memberships: unknown = Reflect.get(plan, "memberships");
    if (
      !Array.isArray(memberships) ||
      memberships.some(
        (member) =>
          !member ||
          typeof member !== "object" ||
          !("organization_id" in member) ||
          !orgIds.includes(member.organization_id) ||
          !("user_id" in member) ||
          !users.includes(member.user_id),
      )
    )
      return false;
  }
  return true;
}
