import { defineConfig, devices } from "@playwright/test";
import { safeProcessEnvironment } from "./e2e/environment.mjs";

const runId = process.env.E2E_RUN_ID ?? "discovery";
const reportPrefix = process.argv.includes("--project=cleanup")
  ? "cleanup-"
  : process.argv.includes("--project=preflight")
    ? "preflight-"
    : "";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: `.e2e-runs/${runId}/${reportPrefix}results`,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: `.e2e-runs/${runId}/${reportPrefix}report`,
        open: "never",
      },
    ],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3210",
    timezoneId: "UTC",
    // Avoid persisting passwords, cookies, or confirmation tokens in network traces.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: { env: safeProcessEnvironment() },
  },
  projects: [
    { name: "preflight", testMatch: "**/preflight.manual.ts" },
    { name: "chromium", testMatch: "**/*.spec.ts" },
    { name: "cleanup", testMatch: "**/cleanup.manual.ts" },
  ],
});
