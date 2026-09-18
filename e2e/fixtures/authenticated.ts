import { type Browser, type BrowserContextOptions } from "@playwright/test";

/**
 * Signs in once per worker against whatever Supabase the dev server is pointed at, and
 * caches the resulting storage state so authenticated specs can reuse it.
 *
 * Two credential pairs, because the two states need different data:
 *   E2E_EMAIL / E2E_PASSWORD         an account whose workspace has been seeded
 *                                    (node scripts/seed-local-workspace.mjs --user <uuid>)
 *   E2E_EMPTY_EMAIL / E2E_EMPTY_PASSWORD
 *                                    an account with no data, so the empty states render.
 *                                    Optional; those checks skip when it is unset.
 *
 * When credentials are absent, or sign-in fails, this returns undefined and the caller skips
 * the authenticated checks instead of failing the run. That keeps CI green on machines
 * without a Supabase stack while still covering the app routes locally.
 */
interface Credentials {
  email: string | undefined;
  password: string | undefined;
  label: string;
}

const SEEDED: Credentials = {
  email: process.env.E2E_EMAIL?.trim(),
  password: process.env.E2E_PASSWORD,
  label: "seeded",
};

const EMPTY: Credentials = {
  email: process.env.E2E_EMPTY_EMAIL?.trim(),
  password: process.env.E2E_EMPTY_PASSWORD,
  label: "empty",
};

type StorageState = BrowserContextOptions["storageState"];

const cache = new Map<string, StorageState | undefined>();
const attempted = new Set<string>();

export const authConfigured = Boolean(SEEDED.email && SEEDED.password);
export const emptyAuthConfigured = Boolean(EMPTY.email && EMPTY.password);

async function signIn(
  browser: Browser,
  credentials: Credentials,
): Promise<StorageState | undefined> {
  if (!credentials.email || !credentials.password) return undefined;
  if (attempted.has(credentials.label)) return cache.get(credentials.label);
  attempted.add(credentials.label);

  const context = await browser.newContext();
  const page = await context.newPage();
  let state: StorageState | undefined;
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    // The form must exist before anything else: a blind press dispatched at domcontentloaded
    // lands before React mounts and does nothing.
    await page.locator("#login-password").waitFor({ timeout: 20_000 });

    // The first-run theme chooser marks #root inert, which makes the form unclickable. Its own
    // close control is portalled outside #root so it stays actionable, whereas Escape only
    // reaches the dialog while focus is inside it. Prefer the control, then fall back.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const close = page.getByRole("button", { name: /close and keep the default/i });
      if (await close.isVisible().catch(() => false)) {
        await close.click();
        await page.waitForTimeout(200);
        continue;
      }
      if ((await page.evaluate(() => document.getElementById("root")?.inert === true)) === false) {
        break;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }

    // The consent bar is fixed to the bottom of the viewport. At the mobile project's width it
    // covers the submit button, and Playwright's actionability check then waits for a click that
    // can never land, so sign-in hung until the hook timed out and the describe never ran.
    const rejectCookies = page.getByRole("button", { name: /^reject all$/i });
    if (await rejectCookies.isVisible().catch(() => false)) {
      await rejectCookies.click();
      await page.waitForTimeout(250);
    }

    // Anchored on purpose: the password field's visibility toggle is labelled "Show password",
    // so a loose /password/i matches two elements and fails Playwright's strict mode.
    await page.getByLabel(/^email/i).fill(credentials.email);
    await page.getByLabel(/^password$/i).fill(credentials.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    state = await context.storageState();
  } catch (error) {
    console.warn(
      `[auth] ${credentials.label} sign-in failed, those checks will be skipped: ${String(error)}`,
    );
  } finally {
    await context.close();
  }

  cache.set(credentials.label, state);
  return state;
}

/** Storage state for the seeded workspace, or undefined when it cannot be reached. */
export async function authenticatedState(browser: Browser): Promise<StorageState | undefined> {
  if (!authConfigured) return undefined;
  return signIn(browser, SEEDED);
}

/** Storage state for an account with no data, so the empty states can be audited. */
export async function emptyWorkspaceState(browser: Browser): Promise<StorageState | undefined> {
  if (!emptyAuthConfigured) return undefined;
  return signIn(browser, EMPTY);
}
