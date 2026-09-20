import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// The authenticated half needs four E2E_* variables and Playwright loads no .env file of its own,
// so an optional, gitignored .env.e2e beside this file is read here. Keep that file to E2E_* keys:
// everything in it lands in process.env, which the dev servers this config starts inherit too. A
// variable already set in the environment wins over the file, and an absent file is the normal
// case, since CI has none. Any other failure means the file is there but unreadable, and quietly
// skipping the authenticated half would let a green run mean nothing.
try {
  process.loadEnvFile(fileURLToPath(new URL(".env.e2e", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @zoption/api dev:e2e",
      url: "http://localhost:8787/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @zoption/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
