import { expect, test } from "@playwright/test";

test("mobile demo exposes a read-only overview and account actions", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Your month, at a glance" })).toBeVisible();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Budgets" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Transactions" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
