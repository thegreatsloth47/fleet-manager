import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import {
  configuration,
  publicProcessEnvironment,
  safeProcessEnvironment,
} from "./environment.mjs";

const args = process.argv.slice(2);
const cleanup = args[0] === "--cleanup";
const listing = args.includes("--list");
const preflight = args[0] === "--preflight";
let server;
let runner;
let interrupted = false;

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    // Windows SIGTERM kills only the CLI parent; terminate its Next/browser
    // descendants too so a completed run does not retain port 3210.
    await new Promise((resolve) => {
      const taskkill = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          env: safeProcessEnvironment(),
          stdio: "ignore",
          windowsHide: true,
        },
      );
      taskkill.once("exit", resolve);
      taskkill.once("error", () => {
        child.kill();
        resolve();
      });
    });
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      timer.unref();
    }),
  ]);
}

try {
  if (!listing) configuration();
  if (cleanup && !process.env.E2E_RUN_ID)
    throw new Error("Cleanup requires the original E2E_RUN_ID.");
  const runId = process.env.E2E_RUN_ID || randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      runId,
    )
  )
    throw new Error("E2E_RUN_ID must be a UUID.");
  const directory = `.e2e-runs/${runId}`;
  if (cleanup && !existsSync(directory))
    throw new Error(
      "Recovery directory is missing. Restore the original run artifact first.",
    );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  console.log(
    `E2E run: ${runId}. Evidence and recovery manifests: ${directory}`,
  );
  const port = 3210;
  const baseURL = `http://127.0.0.1:${port}`;
  const stop = () => {
    interrupted = true;
    void stopProcess(runner);
    void stopProcess(server);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if (!cleanup && !listing && !preflight) {
    // Never reuse another app instance or run beside next dev in the same checkout.
    if (existsSync(".next/dev/lock"))
      throw new Error(
        "Stop the existing next dev server before running E2E in this checkout.",
      );
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once("error", () =>
        reject(
          new Error("Port 3210 is occupied; refusing to reuse another server."),
        ),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
    const log = createWriteStream(`${directory}/next.log`, { mode: 0o600 });
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        env: publicProcessEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.pipe(log);
    server.stderr.pipe(log);
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (interrupted || server.exitCode !== null)
        throw new Error("Next.js stopped; inspect next.log.");
      try {
        ready = (await fetch(baseURL, { signal: AbortSignal.timeout(1000) }))
          .ok;
      } catch {
        /* Startup is still pending. */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready)
      throw new Error("Next.js did not become ready; inspect next.log.");
  }
  const testArgs = cleanup
    ? ["--project=cleanup"]
    : preflight
      ? ["--project=preflight"]
      : ["--project=chromium", ...args];
  runner = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...testArgs],
    {
      env: { ...process.env, E2E_RUN_ID: runId, E2E_BASE_URL: baseURL },
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    runner.once("error", () =>
      reject(new Error("Unable to start Playwright.")),
    );
    runner.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "E2E runner failed.");
  process.exitCode = 1;
} finally {
  await stopProcess(server);
}
