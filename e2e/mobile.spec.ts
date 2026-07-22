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
