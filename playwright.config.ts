import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// The authenticated half needs four E2E_* variables and Playwright loads no .env file of its own,
// so an optional, gitignored .env.e2e beside this file is read here. Keep that file to E2E_* keys:
// everything in it lands in process.env, which the dev servers this config starts inherit too. A
// variable already set in the environment wins over the file, and an absent file is the normal
// case, since CI has none. Any other failure means the file is there but unreadable, and quietly
// skipping the authenticated half would let a green run mean nothing.
const envFile = fileURLToPath(new URL(".env.e2e", import.meta.url));
let envFileLoaded = false;
try {
  process.loadEnvFile(envFile);
  envFileLoaded = true;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// A malformed line such as "E2E_EMAIL audit@example.com" parses without complaint and sets
// nothing, so a file that exists is no proof it configured anything. When the file was read at
// all, the effective values in process.env are what count, and anything unusable fails here rather
// than letting the authenticated half skip to a green run.
if (envFileLoaded) {
  const missingRequired = ["E2E_EMAIL", "E2E_PASSWORD"].filter((key) => !process.env[key]);
  if (missingRequired.length > 0) {
    throw new Error(
      `.env.e2e is present but leaves ${missingRequired.join(" and ")} unset, so the authenticated ` +
        `half of the suite would skip and a green run would mean nothing. Set each missing key as ` +
        `KEY=value in that file, export the value in the environment, or delete the file.`,
    );
  }

  // The empty-workspace pair is optional — those checks skip when it is unset — but a half pair
  // can never sign in, so it is refused rather than silently skipped.
  const missingOptional = ["E2E_EMPTY_EMAIL", "E2E_EMPTY_PASSWORD"].filter(
    (key) => !process.env[key],
  );
  if (missingOptional.length === 1) {
    throw new Error(
      `.env.e2e sets one of E2E_EMPTY_EMAIL and E2E_EMPTY_PASSWORD but leaves ` +
        `${missingOptional[0]} unset. Those checks skip when the pair is absent, so set ` +
        `${missingOptional[0]} too or remove the other key.`,
    );
  }
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
