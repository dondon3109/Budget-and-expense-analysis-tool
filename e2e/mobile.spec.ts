import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zoption-theme", "light"));
});

test("mobile landing keeps account actions and preview usable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Zoption makes your money clear. Decide what comes next." }),
  ).toBeVisible();
  const startFree = page.getByRole("link", { name: "Start free", exact: true });
  await expect(startFree).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Illustrative preview of the Zoption monthly dashboard" }),
  ).toBeVisible();
  const importHeading = page.getByRole("heading", {
    name: "Import from the files you already use.",
  });
  await importHeading.scrollIntoViewIfNeeded();
  await expect(importHeading).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with Excel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your bank export" })).toBeVisible();

  const formatsHeading = page.getByRole("heading", {
    name: "Bring a bank or spreadsheet export.",
  });
  await formatsHeading.scrollIntoViewIfNeeded();
  await expect(formatsHeading).toBeVisible();
  const formatsSection = page.getByRole("region").filter({
    hasText: "Bring a bank or spreadsheet export.",
  });
  await expect(
    formatsSection.getByText(/Bank names are shown to indicate supported export formats only/i),
  ).toBeVisible();
  await expect(formatsSection.locator(".formats-track .formats-group")).toHaveCount(2);

  const installSection = page.getByRole("region", { name: "Take Zoption to Android." });
  await installSection.scrollIntoViewIfNeeded();
  await expect(installSection.getByRole("link", { name: "Download Android APK" })).toBeVisible();

  const themeToggle = page.getByRole("button", {
    name: "Choose theme. Current theme: Light",
  });
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await startFree.click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".auth-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your Zoption account" })).toBeVisible();
});

test("first-visit bottom sheet previews and confirms Coffee without overflow", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Choose how Zoption looks" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("radio", { name: "Preview Light theme" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Preview Dark theme" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Preview Coffee theme" })).toBeVisible();

  await page.getByRole("radio", { name: "Preview Coffee theme" }).click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "coffee");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBeNull();

  const confirm = page.getByRole("button", { name: "Confirm Coffee theme" });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("zoption-theme")))
    .toBe("coffee");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("supported formats marquee becomes static with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const formatsSection = page.getByRole("region").filter({
    hasText: "Bring a bank or spreadsheet export.",
  });
  await formatsSection.scrollIntoViewIfNeeded();
  await expect(formatsSection).toBeVisible();

  const formatsTrack = formatsSection.locator(".formats-track");
  await expect
    .poll(() => formatsTrack.evaluate((track) => getComputedStyle(track).animationName))
    .toBe("none");
  await expect(
    formatsSection.getByRole("button", { name: /supported export formats animation/i }),
  ).toHaveCount(0);
  await expect(
    formatsSection.locator('.formats-group[data-marquee-copy="duplicate"]'),
  ).toBeHidden();

  const primaryNames = formatsSection.locator('.formats-group[data-marquee-copy="primary"] span');
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
