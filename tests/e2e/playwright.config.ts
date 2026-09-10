import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");
const dataDir = path.resolve(dirname, ".e2e-data");

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec tsx src/server.ts",
      cwd: path.join(repoRoot, "apps/api"),
      env: {
        PORT: "4000",
        DATA_DIR: dataDir,
        RUNTIME_DIST_DIR: path.join(repoRoot, "apps/runtime/dist"),
      },
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @scorm-quiz/web dev",
      cwd: repoRoot,
      env: { VITE_API_BASE_URL: "http://localhost:4000" },
      url: "http://localhost:5173",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
  ],
});

export const E2E_API_BASE_URL = "http://localhost:4000";
