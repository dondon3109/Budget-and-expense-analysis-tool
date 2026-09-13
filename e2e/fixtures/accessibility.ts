import AxeBuilder from "@axe-core/playwright";
import { type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Shared accessibility helpers for the desktop and mobile specs.
 *
 * Only serious and critical findings fail the run; everything else is logged.
 */
export const BLOCKING = new Set(["serious", "critical"]);

export const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/faq",
  "/guides",
  "/changelog",
  "/install",
  "/login",
  "/signup",
  "/does-not-exist",
];

export const APP_ROUTES = [
  "/app",
  "/app/transactions",
  "/app/budgets",
  "/app/calendar",
  "/app/plan",
  "/app/subscriptions",
  "/app/import",
  "/app/settings",
  "/app/assistant",
  "/app/tutorials",
  "/app/support/reports",
];

/**
 * The routes whose loading and error states get their own pass. Each has a distinct
 * skeleton or failure panel, so auditing one of each pattern is enough; scanning all
 * eleven in all three states would triple the run for no extra coverage.
 */
export const APP_STATE_ROUTES = ["/app", "/app/transactions", "/app/budgets", "/app/subscriptions", "/app/plan"];

/**
 * Routes with a designed empty state worth auditing on a workspace that holds no data.
 * The seeded account never renders these, so they need their own credentials.
 */
export const APP_EMPTY_STATE_ROUTES = ["/app", "/app/transactions", "/app/budgets"];

export interface Finding {
  id: string;
  impact: string | null;
  target: string;
  detail: string;
}

/**
 * Refusals this configuration deliberately asks for.
 *
 * The e2e API runs with ASSISTANT_ENABLED=false (apps/api/wrangler.e2e.jsonc), and
 * apps/api/src/routes/assistant.ts answers every assistant route with a 404
 * "assistant_not_enabled" when the feature is off — deliberately, and with a machine-readable code.
 * Two pages (FinancialPlanPage and AssistantPage) request assistant preferences regardless, because
 * the browser has no flag telling it the feature is off. Those refusals are expected here and say
 * nothing about the UI being audited.
 *
 * Kept narrow on purpose: anything else the server refuses still fails the run. The clean contract
 * would be a build-time assistant flag for the web app so it could skip the request entirely.
 */
const EXPECTED_REFUSALS = [/\/api\/app\/assistant\/preferences$/];

/** Refusals that are not a deliberate, configuration-driven one. */
export function unexpectedFailures(failedRequests: string[]): string[] {
  return failedRequests.filter(
    (entry) => !EXPECTED_REFUSALS.some((pattern) => pattern.test(entry)),
  );
}

export interface AppRouteAudit {
  findings: Finding[];
  /** Console errors the page produced while loading — a route that throws with real data. */
  consoleErrors: string[];
  /**
   * Requests the server refused, as "STATUS URL". The browser's console only says
   * "Failed to load resource: 404", which is not enough to act on.
   */
  failedRequests: string[];
  /** The page's h1, which proves the route rendered rather than redirecting or blanking. */
  heading: string;
}

/**
 * useRootLock sets #root inert + aria-hidden while an overlay is open, and in that state
 * axe only sees the overlay — which is how a page full of violations once reported clean.
 * Dismiss any first-run dialog, then refuse to analyse if the root is still inert.
 */
export async function dismissOverlays(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inert = await page.evaluate(() => document.getElementById("root")?.inert === true);
    if (!inert) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }

  // The review prompt is modal and only appears once its eligibility request resolves, which can
  // be after the first check above. Dismiss it by its own control so the route is measurable.
  const closeReviewPrompt = page.getByRole("button", { name: /remind me about reviewing/i });
  if (await closeReviewPrompt.isVisible().catch(() => false)) {
    // Bounded on purpose. This is a best-effort dismissal, and an unguarded click waits forever
    // for actionability — which is what hung the empty-workspace audits. If the control is
    // covered, the inert check below still refuses to measure a hidden page.
    await closeReviewPrompt.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

/**
 * Waits for the startup splash to clear.
 *
 * PrivateAppStartupGate covers every /app route for a minimum of three seconds and holds the real
 * content `inert` + `aria-hidden` underneath. Reading the page before it clears sees the splash,
 * not the route — which is how /app/assistant looked like it had no h1 when it in fact had not
 * rendered yet. The same overlay would let a scan report a clean pass over a hidden page, so this
 * waits, and then fails loudly rather than measuring the wrong thing.
 */
export async function waitForAppReady(page: Page, route: string): Promise<void> {
  const isHidden = () =>
    page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".private-app-startup-content");
      return content === null || content.inert === true;
    });

  try {
    await page.waitForFunction(
      () => {
        const content = document.querySelector<HTMLElement>(".private-app-startup-content");
        return content !== null && content.inert !== true;
      },
      undefined,
      { timeout: 20_000 },
    );
    // Then confirm it stays visible. Without this the wait can pass in the instant before React
    // sets inert, which is exactly the race that made /app/assistant look like it had no heading.
    await page.waitForTimeout(600);
    if (await isHidden()) {
      throw new Error("the splash reappeared after a brief clear");
    }
  } catch {
    throw new Error(
      `${route}: the startup splash never cleared after 20s, so the route was never actually shown. ` +
        "The splash keeps the app content inert and aria-hidden, so a scan here would be measuring a hidden page.",
    );
  }
}

/**
 * Opens an authenticated route, lets it settle, and reports everything a reviewer needs:
 * accessibility findings, console errors, and the rendered heading. A route that renders
 * nothing, redirects, or throws with real data fails loudly here instead of passing a scan
 * over an empty shell.
 */
export async function auditAppRoute(page: Page, route: string): Promise<AppRouteAudit> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const collect = (message: ConsoleMessage) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  };
  const collectResponse = (response: { status: () => number; url: () => string }) => {
    const status = response.status();
    if (status >= 400) failedRequests.push(`${status} ${response.url()}`);
  };
  page.on("console", collect);
  page.on("response", collectResponse);
  try {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    // Bounded. An empty workspace keeps polling, so the network may never go fully idle and this
    // waited forever — which is what hung the empty-state audits. Readiness is established by
    // waitForAppReady below, not by this.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    // Before the heading, never after: the splash is what hides the route.
    await waitForAppReady(page, route);
    // Once more, now that late-arriving overlays have had their chance to open.
    await dismissOverlays(page);
    await page.waitForTimeout(400);

    const heading = await page.evaluate(() =>
      (document.querySelector("h1")?.textContent ?? "").trim(),
    );
    const findings = await analyseVisible(page, route);

    // The browser logs "Failed to load resource ... 404" with no URL, so the echo of an expected
    // refusal can only be attributed by correlation: drop it only when a refusal we already expect
    // was actually observed AND nothing unexpected failed. Otherwise it is reported as-is.
    const unexpected = unexpectedFailures(failedRequests);
    const sawExpectedRefusal = failedRequests.some(
      (entry) => !unexpected.includes(entry),
    );
    const reportedConsoleErrors =
      unexpected.length > 0 || !sawExpectedRefusal
        ? consoleErrors
        : consoleErrors.filter((message) => !/Failed to load resource/i.test(message));

    return { findings, consoleErrors: reportedConsoleErrors, failedRequests, heading };
  } finally {
    page.off("console", collect);
    page.off("response", collectResponse);
  }
}

/**
 * Audits a route whose data never arrives. `pending` leaves every API call unanswered so the
 * loading placeholders stay on screen — the only way to scan them — and `failed` aborts them
 * so the error panels render. Neither state is reachable in a normal page load once the API
 * is up, and both are product surfaces the critique called out.
 */
export async function auditAppRouteApiState(
  page: Page,
  route: string,
  state: "pending" | "failed",
): Promise<Finding[]> {
  await page.route("**/api/**", (request) => {
    if (state === "failed") void request.abort();
    // "pending": never fulfil, so the request hangs and the placeholders persist.
  });
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  // The splash has to clear here too: it covers the route and holds it inert, so measuring
  // before it goes means measuring the splash and calling the result "the loading state".
  await waitForAppReady(page, `${route} (${state})`);
  await page.waitForTimeout(800);
  return analyseVisible(page, `${route} (${state})`);
}

/**
 * Saves a screenshot for the review pass that accompanies the scan. Reading the images is
 * part of the verification, not an optional extra: every purely visual defect found so far
 * (overlapping elements, a wrapped label, a 16px heading) came from looking, not from axe.
 */
export async function captureRoute(page: Page, route: string, label: string): Promise<void> {
  const safe = route.replace(/[^a-z0-9]+/gi, "_") || "root";
  await page.screenshot({ path: `test-results/app-audit/${label}-${safe}.png`, fullPage: false });
}

/**
 * axe evaluates the whole document at every scroll position, including elements that are
 * far off-screen and not painted. For those it can guess the wrong backdrop: the landing
 * page chat bubbles were reported as dark-on-dark 1.26:1 when they are really ~13:1, and
 * the same run hid a genuine 2.82:1 chip further down the page.
 *
 * So walk the page a viewport at a time and keep only findings whose element is actually
 * on screen at that moment. Every element becomes visible at some step, so real problems
 * are still caught, and unverifiable off-screen guesses are dropped instead of reported.
 */
export async function analyseVisible(page: Page, label: string): Promise<Finding[]> {
  // Two things hide the app from axe, and both would let it report a clean pass over a page it
  // never examined: useRootLock inerts #root behind a dialog, and the startup splash inerts the
  // content wrapper. Refuse to measure either.
  const hidden = await page.evaluate(() => {
    if (document.getElementById("root")?.inert === true) return "a dialog is holding the app root inert";
    const content = document.querySelector<HTMLElement>(".private-app-startup-content");
    if (content && content.inert === true) return "the startup splash is still covering the route";
    return null;
  });
  if (hidden) {
    throw new Error(`${label}: ${hidden}, so axe would only inspect the overlay.`);
  }

  // Entrance animations fade from opacity 0, and a scan that samples one mid-flight blends
  // the foreground and background into ratios that never exist in the settled state (the
  // sticky mobile CTA was reported at 2.89:1 and 4.42:1 when its real ratios are 5.50:1 and
  // 10:1, and the numbers moved between runs). WCAG assesses the presented steady state, and
  // axe's guidance is to disable animations when scanning, so do it outright rather than
  // relying on the reduced-motion media query alone.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });

  const steps = await page.evaluate(() =>
    Math.min(Math.max(Math.ceil(document.documentElement.scrollHeight / window.innerHeight), 1), 14),
  );

  const found = new Map<string, Finding>();
  const advisory: string[] = [];

  for (let step = 0; step < steps; step += 1) {
    await page.evaluate((index) => window.scrollTo(0, index * window.innerHeight), step);
    await page.waitForTimeout(200);

    const results = await new AxeBuilder({ page }).analyze();
    for (const violation of results.violations) {
      const blocking = BLOCKING.has(violation.impact ?? "");
      const selectors = violation.nodes.map((node) => node.target.join(" "));
      if (selectors.length === 0) continue;

      const onScreen = await page.evaluate((targets: string[]) => {
        return targets.map((selector) => {
          try {
            const element = document.querySelector(selector);
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
          } catch {
            return false;
          }
        });
      }, selectors);

      violation.nodes.forEach((node, index) => {
        const target = selectors[index];
        if (!target || !onScreen[index]) return;
        if (!blocking) {
          const entry = `${violation.id} @ ${target}`;
          if (!advisory.includes(entry)) advisory.push(entry);
          return;
        }
        const key = `${violation.id}::${target}`;
        if (!found.has(key)) {
          found.set(key, {
            id: violation.id,
            impact: violation.impact ?? null,
            target,
            detail: (node.any?.[0]?.message ?? "").replace(/\s+/g, " ").slice(0, 160),
          });
        }
      });
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));

  if (advisory.length > 0) {
    console.log(`[a11y] ${label}: advisory (non-blocking) — ${advisory.join(", ")}`);
  }

  return [...found.values()];
}
