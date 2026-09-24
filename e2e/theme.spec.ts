import { expect, test } from "@playwright/test";

test("previews and confirms Coffee on a first visit, then keeps all themes reachable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#080b0a");

  const dialog = page.getByRole("dialog", { name: "Choose how Zoption looks" });
  const darkOption = page.getByRole("radio", { name: "Preview Dark theme" });
  const coffeeOption = page.getByRole("radio", { name: "Preview Coffee theme" });
  await expect(dialog).toBeVisible();
  await expect(darkOption).toBeFocused();
  await expect(darkOption).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");

  await coffeeOption.click();
  await expect(dialog).toBeVisible();
  await expect(coffeeOption).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "coffee");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ece3d5");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBeNull();

  await page.getByRole("button", { name: "Confirm Coffee theme" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("zoption-theme")))
    .toBe("coffee");
  await expect(
    page.getByRole("button", { name: "Choose theme. Current theme: Coffee" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          page: styles.getPropertyValue("--page").trim(),
          paper: styles.getPropertyValue("--paper").trim(),
          surface: styles.getPropertyValue("--surface").trim(),
          ink: styles.getPropertyValue("--ink").trim(),
          line: styles.getPropertyValue("--line").trim(),
          chartGrid: styles.getPropertyValue("--chart-grid").trim(),
          colorScheme: document.documentElement.style.colorScheme,
        };
      }),
    )
    .toEqual({
      page: "#ece3d5",
      paper: "#fbf6ee",
      surface: "#fdfaf4",
      ink: "#2a1c15",
      line: "#e0d2bf",
      chartGrid: "#e0d2bf",
      colorScheme: "light",
    });

  await page.goto("/login");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "coffee");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "coffee");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const themeTrigger = page.getByRole("button", {
    name: "Choose theme. Current theme: Coffee",
  });
  await themeTrigger.click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe("light");

  await page.getByRole("button", { name: "Choose theme. Current theme: Light" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          page: styles.getPropertyValue("--page").trim(),
          paper: styles.getPropertyValue("--paper").trim(),
          surface: styles.getPropertyValue("--surface").trim(),
          line: styles.getPropertyValue("--line").trim(),
          chartGrid: styles.getPropertyValue("--chart-grid").trim(),
        };
      }),
    )
    .toEqual({
      page: "#080b0a",
      paper: "#111615",
      surface: "#131918",
      line: "#222b29",
      chartGrid: "#222b29",
    });
});

test("migrates a saved legacy theme to the Zoption storage key", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("clarity-theme", "dark"));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe("dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clarity-theme"))).toBeNull();
});
