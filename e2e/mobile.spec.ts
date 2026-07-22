import { expect, test } from "@playwright/test";

test("mobile landing keeps account actions and preview usable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "See where your money goes. Decide what comes next." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Illustrative preview of the Clarity monthly dashboard" }),
  ).toBeVisible();
  const importHeading = page.getByRole("heading", {
    name: "Import from the files you already use.",
  });
  await importHeading.scrollIntoViewIfNeeded();
  await expect(importHeading).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with Excel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your bank export" })).toBeVisible();
  const importSection = page.getByRole("region", {
    name: "Import from the files you already use.",
  });
  await expect(importSection.locator(".import-support-inner")).toHaveCount(0);
  await expect
    .poll(() => importSection.evaluate((section) => getComputedStyle(section).backgroundImage))
    .toContain("linear-gradient");
  await expect
    .poll(() => importSection.evaluate((section) => getComputedStyle(section).backgroundImage))
    .not.toContain("url(");

  const formatsHeading = page.getByRole("heading", { name: "Supported Export Formats" });
  await formatsHeading.scrollIntoViewIfNeeded();
  await expect(formatsHeading).toBeVisible();
  const formatsSection = page.getByRole("region", { name: "Supported Export Formats" });
  expect(
    await importSection.evaluate((section) => {
      const formats = document.querySelector(".supported-formats");
      return formats
        ? formats.getBoundingClientRect().top < section.getBoundingClientRect().bottom
        : false;
    }),
  ).toBe(true);
  await expect(
    formatsSection.getByText(/Bank names are shown to indicate supported export formats only/i),
  ).toBeVisible();
  await expect
    .poll(() =>
      formatsSection
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);

  const themeToggle = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
  await expect(themeToggle).toBeVisible();
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    initialTheme === "dark" ? "light" : "dark",
  );

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole("link", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your Clarity account" })).toBeVisible();
});

test("supported formats marquee becomes static with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const formatsSection = page.getByRole("region", { name: "Supported Export Formats" });
  await formatsSection.scrollIntoViewIfNeeded();
  await expect(formatsSection).toBeVisible();

  const formatsTrack = formatsSection.locator(".supported-formats-track");
  await expect
    .poll(() => formatsTrack.evaluate((track) => getComputedStyle(track).animationName))
    .toBe("none");
  await expect(
    formatsSection.getByRole("button", { name: /supported export formats animation/i }),
  ).toHaveCount(0);
  await expect(
    formatsSection.locator('.supported-formats-group[data-marquee-copy="duplicate"]'),
  ).toBeHidden();

  const primaryNames = formatsSection.locator(
    '.supported-formats-group[data-marquee-copy="primary"] .supported-format-name',
  );
  await expect(primaryNames).toHaveText([
    "BPI",
    "BDO",
    "MariBank",
    "Bank of America",
    "JPMorgan / Chase",
  ]);
  for (const name of await primaryNames.all()) {
    await expect(name).toBeVisible();
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
