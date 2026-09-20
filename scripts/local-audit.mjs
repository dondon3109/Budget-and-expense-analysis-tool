#!/usr/bin/env node
/**
 * Runs the authenticated accessibility audit against the no-Docker auth stub.
 *
 * Why this wrapper exists: when the stub is not up, e2e/accessibility.spec.ts skips the
 * authenticated half instead of failing and Playwright still exits 0, so a green run would prove
 * nothing. Both checks below fail closed for that reason. The script never starts or stops the
 * stub — that belongs to another terminal, so the command is named in every refusal.
 *
 *   pnpm test:e2e:stub                            # every spec
 *   pnpm test:e2e:stub e2e/accessibility.spec.ts  # extra arguments go to Playwright
 *
 * Start the stub first:
 *   node scripts/fake-supabase-auth.mjs --port 54321 \
 *     --user 08060c19-8a55-4046-a2e7-7384808dd81c \
 *     --user-for empty@example.com=1f0e6a2c-3b4d-4e5f-8a90-1234567890ab
 *
 * The second identity is not decoration: it is what gives the empty-workspace audits an account
 * with no data, and it only takes effect as a UUID different from --user.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STUB_URL = "http://127.0.0.1:54321";
const STUB_HEALTH = `${STUB_URL}/auth/v1/health`;
const WEB_ENV = join(ROOT, "apps/web/.env.local");
const SCREENSHOTS = join(ROOT, "test-results/app-audit");

const STUB_COMMAND = `node scripts/fake-supabase-auth.mjs --port 54321 \\
  --user 08060c19-8a55-4046-a2e7-7384808dd81c \\
  --user-for empty@example.com=1f0e6a2c-3b4d-4e5f-8a90-1234567890ab`;

// The stub ignores the key, but supabase-js refuses to sign in with an empty one.
const WEB_ENV_CONTENTS = `# Local e2e configuration: points the web app at the auth stub
# (scripts/fake-supabase-auth.mjs). Gitignored. Remove to go back to the cloud project.
VITE_SUPABASE_URL=${STUB_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local-test-key`;

/** The value of a top-level KEY=... line, or undefined. */
function envValue(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

/**
 * True only for the stub. A real local Supabase answers /auth/v1/health as well, and on this port
 * it is the stack whose identity call returns 500, so its health response must not count as a pass.
 */
async function stubIsRunning() {
  try {
    const response = await fetch(STUB_HEALTH, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return false;
    const health = await response.json();
    return health?.name === "fake-supabase-auth";
  } catch {
    return false;
  }
}

/** Why apps/web/.env.local cannot point the web app at the stub, or null when it does. */
function webEnvProblem() {
  if (!existsSync(WEB_ENV)) return "the file does not exist";
  const url = envValue(readFileSync(WEB_ENV, "utf8"), "VITE_SUPABASE_URL");
  if (!url) return "it does not set VITE_SUPABASE_URL";
  if (url.replace(/\/$/, "") !== STUB_URL) return `it sets VITE_SUPABASE_URL=${url}`;
  return null;
}

function refuseStubMissing() {
  console.error(`Refusing to run: the auth stub is not answering ${STUB_HEALTH}.`);
  console.error("Without it Playwright skips every authenticated test and still exits 0, so a");
  console.error("green run would mean nothing. Start it first, in another terminal:\n");
  console.error(`  ${STUB_COMMAND}\n`);
  process.exit(1);
}

function refuseWebEnv(problem) {
  console.error(`Refusing to run: ${WEB_ENV} does not point the web app at the stub — ${problem}.`);
  console.error(`Sign-in would never reach ${STUB_URL}. Write exactly this to that file:\n`);
  console.error(
    WEB_ENV_CONTENTS.split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
  );
  process.exit(1);
}

if (!(await stubIsRunning())) refuseStubMissing();

const webEnvIssue = webEnvProblem();
if (webEnvIssue) refuseWebEnv(webEnvIssue);

console.log(`Auth stub is up at ${STUB_HEALTH}. Running the authenticated audit.\n`);

// A bare -- is what pnpm forwards for 'pnpm test:e2e:stub -- <spec>', and Playwright has no use
// for it; everything else is passed through untouched so a single spec or --project can be named.
const passthrough = process.argv.slice(2).filter((argument) => argument !== "--");

const child = spawn("pnpm", ["test:e2e", ...passthrough], {
  cwd: ROOT,
  stdio: "inherit",
  // What e2e/fixtures/authenticated.ts reads. The stub accepts any password; the empty-workspace
  // account has to be the one the stub was started with --user-for, or the empty-state audits
  // would scan the seeded tenant instead.
  env: {
    ...process.env,
    E2E_EMAIL: "audit@example.com",
    E2E_PASSWORD: "Audit-Pass-1234!",
    E2E_EMPTY_EMAIL: "empty@example.com",
    E2E_EMPTY_PASSWORD: "Empty-Pass-1234!",
  },
});

child.on("error", (error) => {
  console.error(`Could not run pnpm test:e2e: ${error.message}`);
  process.exit(1);
});

child.on("close", (code, signal) => {
  console.log(`\nScreenshots for the visual review pass are written to ${SCREENSHOTS}`);
  console.log("Read them before calling the run clean: axe cannot see overlap or a wrapped label.");
  if (signal) {
    console.error(`Playwright was killed by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
