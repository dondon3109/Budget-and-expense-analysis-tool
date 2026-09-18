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
  unexpectedFailures,
} from "./fixtures/accessibility";
import {
  authConfigured,
  authenticatedState,
  emptyAuthConfigured,
  emptyWorkspaceState,
} from "./fixtures/authenticated";

// Note: animations are disabled inside analyseVisible rather than through test.use, because
// reducedMotion is not a supported option on this Playwright version's test fixture and
// setting it there is silently ignored.

// Scroll-stepped analysis runs axe once per viewport-height step, which is inherently more
// work than a single pass. Give these tests headroom so they cannot flake on a loaded CI box.
test.describe.configure({ timeout: 120_000 });

test.describe("accessibility — public routes (desktop)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      await page.waitForLoadState("networkidle");

      expect(await analyseVisible(page, route)).toEqual([]);
    });
  }
});

test.describe("accessibility — authenticated routes (desktop)", () => {
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

      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, route);
        await captureRoute(page, route, "desktop");

        // Without these two the scan could pass over a blank page or a redirect and look green.
        expect(audit.heading, `${route} rendered no h1`).not.toBe("");
        expect(
          unexpectedFailures(audit.failedRequests),
          `${route} requested something the server refused`,
        ).toEqual([]);
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

  test.describe("views behind a toggle", () => {
    test("/app/subscriptions renewal calendar is accessible", async ({ browser }) => {
      test.skip(!state, "Sign-in was unavailable, so app routes cannot be inspected.");

      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, "/app/subscriptions", {
          // The route opens on the table view. This toggle is the only way the renewal calendar is
          // ever rendered, which is how its invalid grid stayed out of every earlier scan.
          reveal: async (openPage) => {
            await openPage.getByRole("button", { name: "Renewal calendar" }).click();
            await openPage.locator(".renewal-calendar-grid").waitFor();
          },
        });
        await captureRoute(page, "/app/subscriptions/renewal-calendar", "desktop-toggled");

        expect(audit.heading, "/app/subscriptions rendered no h1").not.toBe("");
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });

    test("/app/calendar expanded next month is accessible", async ({ browser }) => {
      test.skip(!state, "Sign-in was unavailable, so app routes cannot be inspected.");

      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      try {
        const audit = await auditAppRoute(page, "/app/calendar", {
          // The next-month grid is collapsed by default, so a scan of the route never saw it.
          reveal: async (openPage) => {
            await openPage.getByRole("group", { name: "Next month" }).getByRole("button").click();
            await openPage.locator(".calendar-next-month [role='grid']").waitFor();
          },
        });
        await captureRoute(page, "/app/calendar/next-month", "desktop-toggled");

        expect(audit.heading, "/app/calendar rendered no h1").not.toBe("");
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });
  });
});

test.describe("accessibility — empty workspace (desktop)", () => {
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
        await captureRoute(page, route, "desktop-empty");

        expect(audit.heading, `${route} rendered no h1`).not.toBe("");
        expect(audit.findings).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
