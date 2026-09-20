import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// The authenticated half needs four E2E_* variables and Playwright loads no .env file of its own,
// so an optional, gitignored .env.e2e beside this file is read here. A variable already set in the
// environment wins over the file, and a missing file is not an error: the authenticated tests skip,
// exactly as they did before the file existed.
try {
  process.loadEnvFile(fileURLToPath(new URL(".env.e2e", import.meta.url)));
} catch {
  // No local credentials configured.
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
