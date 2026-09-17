import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/*
 * Faithful reproduction of the production transaction-filter layout defect: the
 * desktop preset row (This month / Last 30 days / Year to date) declared a flex
 * basis below its own content width, so the card's first flex line reserved too
 * little room and the row spilled past the card edge instead of wrapping.
 */

const foundationStyles = readFileSync(
  new URL("../apps/web/src/styles/foundation.css", import.meta.url),
  "utf8",
);
const privatePrimitivesStyles = readFileSync(
  new URL("../apps/web/src/styles/private-primitives.css", import.meta.url),
  "utf8",
);
const appShellStyles = readFileSync(
  new URL("../apps/web/src/components/layout/AppShell.css", import.meta.url),
  "utf8",
);
const transactionsPageStyles = readFileSync(
  new URL("../apps/web/src/pages/TransactionsPage.css", import.meta.url),
  "utf8",
);

function icon(size: number, paths: string) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

async function renderTransactionFilters(page: Page) {
  await page.setContent(`
    <style>
      /* Tailwind preflight supplies this reset in the app; the extracted
         stylesheets assume border-box sizing. */
      * { box-sizing: border-box; }
    </style>
    <div class="app-main">
      <div class="app-main-content">
        <div class="dashboard-page transactions-page">
          <section class="transaction-filters" aria-label="Transaction filters">
            <form class="search-form">
              ${icon(17, '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />')}
              <input id="transaction-search" type="search" placeholder="Search transactions" />
            </form>
            <div class="filter-select-wrap">
              ${icon(15, '<path d="M3 6h18" />')}
              <select id="kind-filter">
                <option value="">All types</option>
                <option>Money in</option>
                <option>Money out</option>
                <option>Transfers</option>
              </select>
            </div>
            <div class="filter-select-wrap">
              <select id="account-filter"><option value="">All accounts</option></select>
            </div>
            <label class="filter-date-wrap"><span>From</span><input type="date" value="2026-09-01" /></label>
            <label class="filter-date-wrap"><span>To</span><input type="date" value="2026-09-17" /></label>
            <div class="filter-presets" role="group" aria-label="Date presets">
              ${icon(15, '<rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />')}
              <button type="button" class="active">This month</button>
              <button type="button">Last 30 days</button>
              <button type="button">Year to date</button>
            </div>
            <div class="filter-select-wrap">
              <select id="category-filter"><option value="">All categories</option></select>
            </div>
          </section>
        </div>
      </div>
    </div>
  `);
  // Load the real stylesheets in production order so the cascade is faithful.
  await page.addStyleTag({ content: foundationStyles });
  await page.addStyleTag({ content: privatePrimitivesStyles });
  await page.addStyleTag({ content: appShellStyles });
  await page.addStyleTag({ content: transactionsPageStyles });
}

/** Sub-pixel slack for layout rounding of the fractional control widths. */
const TOLERANCE = 0.5;

/** Controls whose right edge escapes the card's content box. */
function overflowingControls(page: Page) {
  return page.locator(".transaction-filters").evaluate((card, tolerance) => {
    const style = getComputedStyle(card);
    const contentRight =
      card.getBoundingClientRect().right -
      parseFloat(style.paddingRight) -
      parseFloat(style.borderRightWidth);
    // The preset wrapper keeps its own width while its nowrap buttons spill out
    // of it, so every element inside the card is measured, not just the groups.
    return Array.from(card.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const className = element.getAttribute("class");
        return {
          name: `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`,
          overflow: element.getBoundingClientRect().right - contentRight,
        };
      })
      .filter((entry) => entry.overflow > tolerance)
      .map((entry) => `${entry.name} spills ${Math.round(entry.overflow * 10) / 10}px`);
  }, TOLERANCE);
}

test("keeps the preset row inside the filter card and on one line", async ({ page }) => {
  for (const viewport of [
    { width: 1402, height: 768 },
    { width: 1050, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await renderTransactionFilters(page);

    const presets = page.getByRole("group", { name: "Date presets" }).getByRole("button");
    await expect(presets).toHaveCount(3);

    expect(
      await overflowingControls(page),
      `controls escaped the filter card at ${viewport.width}px`,
    ).toEqual([]);

    const tops = await presets.evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, `preset row wrapped at ${viewport.width}px`).toBe(1);
  }
});
