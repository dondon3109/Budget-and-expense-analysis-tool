import { expect, test } from "@playwright/test";

test("previews and confirms Coffee on a first visit, then keeps all themes reachable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f1115");

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
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#efe4d2");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBeNull();

  await page.getByRole("button", { name: "Confirm Coffee theme" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe(
    "coffee",
  );
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
      page: "#efe4d2",
      paper: "#fff9ef",
      surface: "#fffdf7",
      ink: "#3a2a23",
      line: "#dbc6aa",
      chartGrid: "#ddcbb4",
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe(
    "light",
  );

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
      page: "#0f1115",
      paper: "#171a20",
      surface: "#1d2128",
      line: "#303640",
      chartGrid: "#303640",
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
