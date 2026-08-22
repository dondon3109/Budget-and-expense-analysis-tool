import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/*
 * Faithful reproduction of the production category-manager layout defect.
 *
 * The `.new-category-form` uses a 4-column grid `1.3fr 0.8fr 1fr auto`. The
 * `Type` `<select>` (which renders "Money out") sits in the `0.8fr` column and
 * is `width: 100%`. At the modal width the category form occupies (~620px, the
 * `.form-modal` width), that column computes narrow enough that the native
 * select truncates "Money out" against its own dropdown indicator, clipped to
 * "Money o" (confirmed in the production incident screenshot). This regression
 * proves the selector keeps sufficient non-overlapping usable width.
 */

const foundationStyles = readFileSync(
  new URL("../apps/web/src/styles/foundation.css", import.meta.url),
  "utf8",
);
const privatePrimitivesStyles = readFileSync(
  new URL("../apps/web/src/styles/private-primitives.css", import.meta.url),
  "utf8",
);
const transactionFormStyles = readFileSync(
  new URL("../apps/web/src/components/transactions/TransactionForm.css", import.meta.url),
  "utf8",
);

/** Usable width a native dropdown indicator needs beyond the selected text. */
const DROPDOWN_INDICATOR_RESERVE = 32;

async function renderCategoryForm(page: Page, modalWidthPx = 620) {
  await page.setContent(`
    <style>
      :root {
        --muted: #617168;
        --ink: #193728;
        --line: #d9dfd9;
        --line-strong: #b7c2ba;
        --surface: #fff;
        --surface-soft: #f6f8f5;
        --surface-hover: #eef2ee;
        --subtle: #889489;
        --overlay: rgba(0, 0, 0, 0.32);
        --paper: #fffdf7;
        --radius-xl: 16px;
        --shadow-dialog: 0 24px 60px rgba(0, 0, 0, 0.2);
        --font-display: ui-serif, Georgia, serif;
        --control-height: 43px;
        --solid-bg: #1b5c3a;
        --solid-hover: #17492f;
        --solid-text: #fff;
        --action: #3f8f74;
      }
      * { box-sizing: border-box; }
    </style>
    <div class="modal-backdrop" role="presentation">
      <section
        class="form-modal category-modal"
        style="width:${modalWidthPx}px"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <header class="modal-header">
          <div><h2 id="category-manager-title">Manage categories</h2></div>
        </header>
        <form class="new-category-form" aria-label="New category">
          <label>
            <span>New category</span>
            <input aria-label="New category" value="Health" />
          </label>
          <label>
            <span>Type</span>
            <select aria-label="Type">
              <option>Money out</option>
              <option>Money in</option>
              <option>Transfer</option>
            </select>
          </label>
          <fieldset>
            <legend>Color</legend>
            <div class="color-picker"><button type="button">Color</button></div>
          </fieldset>
          <button class="button primary" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add
          </button>
        </form>
      </section>
    </div>
  `);
  // Load the real stylesheets in production order so the cascade is faithful.
  await page.addStyleTag({ content: foundationStyles });
  await page.addStyleTag({ content: privatePrimitivesStyles });
  await page.addStyleTag({ content: transactionFormStyles });
}

function measureSelector(page: Page) {
  return page.getByRole("combobox", { name: "Type" }).evaluate((element) => {
    const style = getComputedStyle(element);
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Canvas text measurement is unavailable.");
    const options = Array.from(element.querySelectorAll("option")).map(
      (option) => option.textContent ?? "",
    );
    context.font = style.font;
    const longest = options.reduce((a, b) =>
      context.measureText(a).width >= context.measureText(b).width ? a : b,
    );
    return {
      width: element.getBoundingClientRect().width,
      clientWidth: element.clientWidth,
      usableWidth:
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      longestTextWidth: context.measureText(longest).width,
    };
  });
}

test("keeps the Money out selector and dropdown indicator usable at 1402x768", async ({ page }) => {
  await page.setViewportSize({ width: 1402, height: 768 });
  await renderCategoryForm(page);

  const selector = page.getByRole("combobox", { name: "Type" });
  await expect(selector).toHaveValue("Money out");
  await expect(selector).toHaveCSS("min-height", "43px");

  const { usableWidth, longestTextWidth } = await measureSelector(page);
  expect(usableWidth).toBeGreaterThanOrEqual(longestTextWidth + DROPDOWN_INDICATOR_RESERVE);
});

test("keeps the selector usable across category-form breakpoints", async ({ page }) => {
  for (const viewport of [
    { width: 1050, height: 768 },
    { width: 760, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await renderCategoryForm(page);

    const selector = page.getByRole("combobox", { name: "Type" });
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Money out");
    await expect(selector).toHaveCSS("min-height", "43px");
  }
});
