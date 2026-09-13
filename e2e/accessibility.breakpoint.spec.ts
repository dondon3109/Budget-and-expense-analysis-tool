import { expect, test } from "@playwright/test";

import {
  analyseVisible,
  APP_ROUTES,
  auditAppRoute,
  dismissOverlays,
  PUBLIC_ROUTES,
} from "./fixtures/accessibility";
import { authConfigured, authenticatedState } from "./fixtures/authenticated";

/**
 * A third viewport, on purpose. The app's layout switches at 760-768px, and the other two
 * specs sit at 1280 and 393 — a breakpoint boundary is exactly where a layout is most likely
 * to be half-switched, and it had never been scanned. The comparison table, the header and
 * the drawer all change behaviour here.
 */

// Note: animations are disabled inside analyseVisible rather than through test.use, because
// reducedMotion is not a supported option on this Playwright version's test fixture and
// setting it there is silently ignored.
test.use({ viewport: { width: 768, height: 1024 } });

// Scroll-stepped analysis runs axe once per viewport-height step, which is inherently more
// work than a single pass. Give these tests headroom so they cannot flake on a loaded CI box.
test.describe.configure({ timeout: 120_000 });

test.describe("accessibility — public routes at the 768px breakpoint", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      await page.waitForLoadState("networkidle");

      expect(await analyseVisible(page, route)).toEqual([]);
    });
  }
});

test.describe("accessibility — authenticated routes at the 768px breakpoint", () => {
  test.skip(
    !authConfigured,
    "Set E2E_EMAIL and E2E_PASSWORD against a running Supabase to cover the app routes.",
  );

  let state: Awaited<ReturnType<typeof authenticatedState>>;

  test.beforeAll(async ({ browser }) => {
    state = await authenticatedState(browser);
  });

  for (const route of APP_ROUTES) {
    test(`${route} renders and has no serious or critical violations`, async ({ browser }) => {
      test.skip(!state, "Sign-in was unavailable, so app routes cannot be inspected.");

      const context = await browser.newContext({
        storageState: state,
        viewport: { width: 768, height: 1024 },
      });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, route);
        expect(audit.heading, `${route} rendered no h1`).not.toBe("");
        expect(audit.consoleErrors, `${route} logged console errors`).toEqual([]);
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
