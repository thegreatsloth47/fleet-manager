import { expect, test } from "vitest";
import {
  validateTarget,
  safeProcessEnvironment,
  existingDevelopmentProject,
} from "./environment.mjs";
import { validManifest } from "./admin";

const project = "abcdefghijklmnopqrst";
const target = {
  E2E_TARGET_ENVIRONMENT: "isolated-e2e",
  E2E_SUPABASE_PROJECT_REF: project,
  E2E_SUPABASE_URL: `https://${project}.supabase.co`,
  E2E_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  E2E_PROTECTED_PROJECT_REFS: existingDevelopmentProject,
};

test("accepts only the explicitly allowlisted isolated project", () => {
  expect(validateTarget(target).project).toBe(project);
});

test.each([
  {},
  { ...target, E2E_TARGET_ENVIRONMENT: "development" },
  { ...target, E2E_TARGET_ENVIRONMENT: "production" },
  { ...target, E2E_SUPABASE_URL: `http://${project}.supabase.co` },
  { ...target, E2E_SUPABASE_URL: `https://${project}.supabase.co.evil.test` },
  { ...target, E2E_SUPABASE_URL: `https://${project}.supabase.co/path` },
  { ...target, E2E_PROTECTED_PROJECT_REFS: "" },
  {
    ...target,
    E2E_PROTECTED_PROJECT_REFS: `${existingDevelopmentProject},${project}`,
  },
  {
    ...target,
    E2E_SUPABASE_PROJECT_REF: existingDevelopmentProject,
    E2E_SUPABASE_URL: `https://${existingDevelopmentProject}.supabase.co`,
    E2E_PROTECTED_PROJECT_REFS: project,
  },
  { ...target, E2E_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do-not-expose" },
])("blocks unsafe or incomplete target configuration %#", (input) => {
  expect(() => validateTarget(input)).toThrow();
});

test("Next/browser process environment never inherits administrative or unrelated secrets", () => {
  const safe = safeProcessEnvironment({
    PATH: "/bin",
    HOME: "/tmp",
    SystemRoot: "C:\\Windows",
    E2E_SUPABASE_ADMIN_KEY: "secret",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    GITHUB_TOKEN: "secret",
    NODE_OPTIONS: "--require malicious",
    NEXT_PUBLIC_SUPABASE_URL: "https://wrong-project.test",
  });
  expect(safe).toEqual({
    PATH: "/bin",
    HOME: "/tmp",
    SystemRoot: "C:\\Windows",
  });
  expect(JSON.stringify(safe)).not.toContain("secret");
});

const runId = "11111111-1111-4111-8111-111111111111";
const fixtureId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const orgId = "44444444-4444-4444-8444-444444444444";
const manifest = {
  version: 1,
  project,
  runId,
  fixtureId,
  cleaned: false,
  users: [{ id: userId, email: "ff-e2e-11111111-22222222-owner@example.com" }],
  organizations: [
    {
      id: orgId,
      name: `ff-e2e-${runId}-${fixtureId}-organization`,
      ownerId: userId,
    },
  ],
};

test("recovery accepts well-formed identities and a scoped exact-ID deletion plan", () => {
  expect(validManifest(manifest)).toBe(true);
  expect(
    validManifest({
      ...manifest,
      deletionPlan: {
        organizationIds: [orgId],
        assetIds: [],
        meterIds: [],
        entryIds: [],
        revisionIds: [],
        memberships: [{ organization_id: orgId, user_id: userId }],
      },
    }),
  ).toBe(true);
});

test.each([
  null,
  [],
  {},
  { ...manifest, version: 0 },
  { ...manifest, runId: "../escape" },
  { ...manifest, users: [{ id: userId, email: "customer@example.com" }] },
  {
    ...manifest,
    organizations: [{ id: orgId, name: "Customer", ownerId: userId }],
  },
  {
    ...manifest,
    organizations: [{ ...manifest.organizations[0], ownerId: orgId }],
  },
  { ...manifest, deletionPlan: {} },
  {
    ...manifest,
    deletionPlan: {
      organizationIds: [userId],
      assetIds: [],
      meterIds: [],
      entryIds: [],
      revisionIds: [],
      memberships: [],
    },
  },
  {
    ...manifest,
    deletionPlan: {
      organizationIds: [orgId],
      assetIds: ["not-a-uuid"],
      meterIds: [],
      entryIds: [],
      revisionIds: [],
      memberships: [],
    },
  },
  {
    ...manifest,
    deletionPlan: {
      organizationIds: [orgId],
      assetIds: [],
      meterIds: [],
      entryIds: [],
      revisionIds: [],
      memberships: [{ organization_id: orgId, user_id: orgId }],
    },
  },
])("rejects unsafe recovery manifests %#", (input) => {
  expect(validManifest(input)).toBe(false);
});
