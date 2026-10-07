import { defineConfig, devices } from "@playwright/test";

// The signed-in audit against the deployed preview stack, run by the `preview` job of the
// Production Release workflow after the smoke gate (docs/deployment.md, "Preview release").
// It starts no servers: APP_URL is the preview app the job just deployed, and sign-in goes
// through the preview Supabase project with two dedicated test accounts.
//
// Only the signed-in describes run. They load pages and read them, never write, so the seeded
// account keeps the same data from one release to the next. Everything else in e2e/ targets
// the local dev servers in playwright.config.ts.
const REQUIRED = [
  "APP_URL",
  "E2E_EMAIL",
  "E2E_PASSWORD",
  "E2E_EMPTY_EMAIL",
  "E2E_EMPTY_PASSWORD",
] as const;
const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
// Fail before any test is collected: the specs skip when credentials are absent, so a missing
// secret would otherwise pass the release with nothing checked.
if (missing.length > 0) {
  throw new Error(
    `playwright.preview.config.ts needs ${missing.join(", ")}. The E2E_* values are secrets on ` +
      `the preview environment; APP_URL comes from scripts/export-deployment-env.mjs preview.`,
  );
}
process.env.E2E_REQUIRE_AUTH = "1";

export default defineConfig({
  testDir: "./e2e",
  grep: /authenticated routes|empty workspace/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // One retry absorbs a network hiccup against the deployed stack; a real break fails twice.
  retries: 1,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_URL,
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
});
