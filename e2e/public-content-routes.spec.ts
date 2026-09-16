import { existsSync, readFileSync } from "node:fs";

import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The four public pages this slice added: two Philippine peso budgeting guides and two
 * feature explainers. The accessibility suite walks a hand written PUBLIC_ROUTES list, so
 * this spec is the check that the new routes are really published on a running app rather
 * than only registered in the route manifest.
 */

const SITE_ORIGIN = "https://zoption.site";

const CONTENT_ROUTES = [
  {
    path: "/guides/budget-monthly-salary-philippines",
    heading: "How to Budget a Monthly Salary in the Philippines",
  },
  { path: "/guides/50-30-20-rule-pesos", heading: "The 50/30/20 Rule in Pesos" },
  { path: "/features/receipt-scanning", heading: "Scan a receipt into your budget" },
  { path: "/features/voice-expense-entry", heading: "Log spending by voice" },
] as const;

const BUILT_SITEMAP = new URL("../apps/web/dist/sitemap.xml", import.meta.url);

/**
 * The sitemap is a build artifact, not an application route: apps/web/scripts/prerender.mjs
 * writes it into apps/web/dist during a production build, and Cloudflare Pages serves that file
 * at /sitemap.xml. So read the served document first, which is what a built or deployed origin
 * returns, and fall back to the build output it would serve. Null means the origin serves no
 * sitemap and nothing has been built in this checkout.
 */
async function publishedSitemap(request: APIRequestContext): Promise<string | null> {
  const response = await request.get("/sitemap.xml");
  const served = response.ok() ? await response.text() : "";
  if (served.includes("<urlset")) return served;

  return existsSync(BUILT_SITEMAP) ? readFileSync(BUILT_SITEMAP, "utf8") : null;
}

test.beforeEach(async ({ page }) => {
  // The first run theme chooser holds #root aria-hidden while it is open, which hides the page
  // heading from a role query. A stored preference skips the chooser entirely.
  await page.addInitScript(() => window.localStorage.setItem("zoption-theme", "light"));
});

test.describe("published public content routes", () => {
  for (const route of CONTENT_ROUTES) {
    test(`${route.path} renders its heading and canonical URL`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${SITE_ORIGIN}${route.path}`,
      );
    });
  }

  test("the published sitemap lists every new route", async ({ request }) => {
    const sitemap = await publishedSitemap(request);
    if (sitemap === null) {
      // The Vite dev server this suite normally runs against serves only public/, and the CI e2e
      // job currently runs before the web build, so there may be nothing to read. Skipping names
      // the gap instead of failing an environment that never had a sitemap, or passing on one
      // nobody published.
      test.skip(true, "No sitemap is served at /sitemap.xml and no production build output exists.");
      return;
    }

    for (const route of CONTENT_ROUTES) {
      expect(sitemap).toContain(`<loc>${SITE_ORIGIN}${route.path}</loc>`);
    }
  });
});
