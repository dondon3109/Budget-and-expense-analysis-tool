import { expect, test } from "@playwright/test";

import {
  analyseVisible,
  APP_EMPTY_STATE_ROUTES,
  APP_ROUTES,
  APP_STATE_ROUTES,
  auditAppRoute,
  auditAppRouteApiState,
  captureRoute,
  dismissOverlays,
  PUBLIC_ROUTES,
} from "./fixtures/accessibility";
import {
  authConfigured,
  authenticatedState,
  emptyAuthConfigured,
  emptyWorkspaceState,
} from "./fixtures/authenticated";

/**
 * The same checks at phone width. This is not a duplicate of the desktop spec: the mobile
 * run is what surfaced the horizontally scrolling comparison table being unreachable by
 * keyboard, and a chip failing contrast only in the narrow layout.
 */

// Note: animations are disabled inside analyseVisible rather than through test.use, because
// reducedMotion is not a supported option on this Playwright version's test fixture and
// setting it there is silently ignored.

// Scroll-stepped analysis runs axe once per viewport-height step, which is inherently more
// work than a single pass. Give these tests headroom so they cannot flake on a loaded CI box.
test.describe.configure({ timeout: 120_000 });
test.describe("accessibility — public routes (mobile)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      await page.waitForLoadState("networkidle");

      expect(await analyseVisible(page, route)).toEqual([]);
    });
  }
});

test.describe("accessibility — authenticated routes (mobile)", () => {
  test.skip(
    !authConfigured,
    "Set E2E_EMAIL and E2E_PASSWORD against a running Supabase to cover the app routes.",
  );

  let state: Awaited<ReturnType<typeof authenticatedState>>;

  test.beforeAll(async ({ browser }) => {
    // Signing in waits for the form, clears the theme chooser, submits and then waits for
    // networkidle; the individual waits can sum past the 60s hook default without any one of them
    // failing, which is what stopped this describe from ever running.
    test.setTimeout(180_000);
    state = await authenticatedState(browser);
  });

  for (const route of APP_ROUTES) {
    test(`${route} renders and has no serious or critical violations`, async ({ browser }) => {
      test.skip(!state, "Sign-in was unavailable, so app routes cannot be inspected.");

      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, route);
        await captureRoute(page, route, "mobile");

        // Without these two the scan could pass over a blank page or a redirect and look green.
        expect(audit.heading, `${route} rendered no h1`).not.toBe("");
        expect(audit.consoleErrors, `${route} logged console errors`).toEqual([]);
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  test.describe("loading and error states", () => {
    for (const route of APP_STATE_ROUTES) {
      for (const apiState of ["pending", "failed"] as const) {
        test(`${route} is accessible while its data is ${apiState}`, async ({ browser }) => {
          test.skip(!state, "Sign-in was unavailable, so app routes cannot be inspected.");

          const context = await browser.newContext({ storageState: state });
          const page = await context.newPage();
          try {
            expect(await auditAppRouteApiState(page, route, apiState)).toEqual([]);
          } finally {
            await context.close();
          }
        });
      }
    }
  });
});

test.describe("accessibility — empty workspace (mobile)", () => {
  test.skip(
    !emptyAuthConfigured,
    "Set E2E_EMPTY_EMAIL and E2E_EMPTY_PASSWORD for an account with no data to cover the empty states.",
  );

  let emptyState: Awaited<ReturnType<typeof emptyWorkspaceState>>;

  test.beforeAll(async ({ browser }) => {
    emptyState = await emptyWorkspaceState(browser);
  });

  for (const route of APP_EMPTY_STATE_ROUTES) {
    test(`${route} renders its empty state accessibly`, async ({ browser }) => {
      test.skip(!emptyState, "Sign-in for the empty workspace was unavailable.");

      const context = await browser.newContext({ storageState: emptyState });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, route);
        await captureRoute(page, route, "mobile-empty");

        expect(audit.heading, `${route} rendered no h1`).not.toBe("");
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
