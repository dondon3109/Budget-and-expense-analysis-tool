import { expect, test, type Page } from "@playwright/test";

/**
 * The landing header puts ten in-page links beside the wordmark, the theme control,
 * Sign in, and Start free. Those labels plus the controls need roughly 1420px, and
 * below that the row used to shrink under its own content: the wordmark and
 * "Voice & Scan" painted over each other, and the theme pill sat on top of "FAQ".
 *
 * The header now has three tiers, and these measurements pin all three:
 *   - 1420px and wider: every link sits in the row and no menu trigger is offered;
 *   - 1040-1419px: the primary six stay in the row beside the trigger;
 *   - 1039px and narrower: the drawer owns every link, as it did below 960px.
 */

const FULL_ROW_MIN_WIDTH = 1420;

const EVERY_LANDING_LINK = [
  "Voice & Scan",
  "Features",
  "Budget planner",
  "Why Zoption",
  "Pricing",
  "Android APK",
  "Supported imports",
  "How it works",
  "Reviews",
  "FAQ",
];

const PRIMARY_LANDING_LINKS = [
  "Voice & Scan",
  "Features",
  "Budget planner",
  "Why Zoption",
  "Pricing",
  "FAQ",
];

/** Clear space the row must keep from the wordmark and from the account actions. */
const MIN_EDGE_CLEARANCE = 20;
/** Below this the labels read as one run of text rather than separate targets. */
const MIN_LINK_GAP = 11;

interface HeaderMetrics {
  labels: string[];
  headerOverflow: number;
  pageOverflow: number;
  brandToRow: number | null;
  rowToActions: number | null;
  tightestLinkGap: number | null;
  toggleVisible: boolean;
  ctaRight: number;
  viewportWidth: number;
}

async function measureHeader(page: Page): Promise<HeaderMetrics> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("header.public-header");
    if (!header) throw new Error("The public header did not render.");

    const isVisible = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement && getComputedStyle(element).display !== "none";
    const box = (element: Element) => element.getBoundingClientRect();

    const row = header.querySelector<HTMLElement>(".public-header-links");
    const links = isVisible(row) ? [...row.querySelectorAll("a")].filter(isVisible) : [];
    const firstLink = links.at(0) ?? null;
    const lastLink = links.at(-1) ?? null;
    const brand = box(header.querySelector(".public-header-brand") as Element);
    const actions = box(header.querySelector(".public-header-actions") as Element);
    const gaps = links.flatMap((link, index) => {
      const previous = links[index - 1];
      return previous ? [box(link).left - box(previous).right] : [];
    });

    return {
      labels: links.map((link) => link.textContent?.trim() ?? ""),
      headerOverflow: header.scrollWidth - header.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brandToRow: firstLink ? box(firstLink).left - brand.right : null,
      rowToActions: lastLink ? actions.left - box(lastLink).right : null,
      tightestLinkGap: gaps.length ? Math.min(...gaps) : null,
      toggleVisible: isVisible(header.querySelector(".public-header-menu-toggle")),
      ctaRight: box(header.querySelector(".public-header-cta") as Element).right,
      viewportWidth: window.innerWidth,
    };
  });
}

function expectNothingCollides(metrics: HeaderMetrics) {
  expect(metrics.headerOverflow).toBeLessThanOrEqual(0);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
  expect(metrics.ctaRight).toBeLessThanOrEqual(metrics.viewportWidth - 16);
  if (metrics.brandToRow !== null) {
    expect(metrics.brandToRow).toBeGreaterThanOrEqual(MIN_EDGE_CLEARANCE);
  }
  if (metrics.rowToActions !== null) {
    expect(metrics.rowToActions).toBeGreaterThanOrEqual(MIN_EDGE_CLEARANCE);
  }
  if (metrics.tightestLinkGap !== null) {
    expect(metrics.tightestLinkGap).toBeGreaterThanOrEqual(MIN_LINK_GAP);
  }
}

test.describe("public header layout", () => {
  test.beforeEach(async ({ page }) => {
    // The first-run theme chooser covers the header, and these tests click its trigger.
    await page.addInitScript(() => window.localStorage.setItem("zoption-theme", "light"));
  });

  for (const width of [FULL_ROW_MIN_WIDTH, 1728]) {
    test(`keeps every landing link in one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("header.public-header")).toBeVisible();

      const metrics = await measureHeader(page);
      expect(metrics.labels).toEqual(EVERY_LANDING_LINK);
      expect(metrics.toggleVisible).toBe(false);
      expectNothingCollides(metrics);
    });
  }

  test("keeps the trimmed row clear of the wordmark and the account actions at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("header.public-header")).toBeVisible();

    const metrics = await measureHeader(page);
    expect(metrics.labels).toEqual(PRIMARY_LANDING_LINKS);
    expect(metrics.toggleVisible).toBe(true);
    expectNothingCollides(metrics);
  });

  test("hands the row to the drawer at 1024px and still lists every link", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("header.public-header")).toBeVisible();

    const metrics = await measureHeader(page);
    expect(metrics.labels).toEqual([]);
    expect(metrics.toggleVisible).toBe(true);

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const drawer = page.locator("#public-header-mobile-nav");
    await expect(drawer).toBeVisible();
    expect(await drawer.locator(".public-header-drawer-links a").allInnerTexts()).toEqual(
      EVERY_LANDING_LINK,
    );
    await expect(drawer.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Start free" })).toBeVisible();
  });

  test("leaves a public route whose links are all primary on its full row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("header.public-header")).toBeVisible();

    const metrics = await measureHeader(page);
    expect(metrics.toggleVisible).toBe(false);
    expect(metrics.labels.length).toBeGreaterThan(0);
    expectNothingCollides(metrics);
  });
});
