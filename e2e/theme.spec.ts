import { expect, test } from "@playwright/test";

test("applies the system theme before render and persists a manual choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f1115");
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

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".auth-aside h2")).toHaveCSS("color", "rgb(242, 244, 247)");
  await expect(page.locator(".auth-aside .text-link")).toHaveCSS("color", "rgb(242, 244, 247)");

  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe("light");

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("migrates a saved legacy theme to the Zoption storage key", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("clarity-theme", "dark"));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zoption-theme"))).toBe("dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clarity-theme"))).toBeNull();
});
