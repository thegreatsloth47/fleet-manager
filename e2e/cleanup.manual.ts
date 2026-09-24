import { readdirSync } from "node:fs";
import { test } from "@playwright/test";
import { Fixtures } from "./admin";
test("recover interrupted fixture cleanup", async () => {
  const runId = process.env.E2E_RUN_ID;
  if (!runId)
    throw new Error("Set E2E_RUN_ID to the original run UUID for cleanup.");
  for (const filename of readdirSync(`.e2e-runs/${runId}`)) {
    if (/^[0-9a-f-]{36}\.json$/.test(filename)) {
      const fixtures = new Fixtures(runId, `.e2e-runs/${runId}/${filename}`);
      await fixtures.cleanup();
    }
  }
});
