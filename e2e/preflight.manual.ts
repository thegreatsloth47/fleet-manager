import { test } from "@playwright/test";
import { Fixtures } from "./admin";

test("verify isolated Supabase identity, admin access, and existing schema without writing fixtures", async () => {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) throw new Error("Use npm run test:e2e -- --preflight.");
  const fixtures = new Fixtures(runId);
  await fixtures.verifyProject();
});
