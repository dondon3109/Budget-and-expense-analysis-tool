import { expect, test } from "@playwright/test";

test("mobile navigation reaches the responsive budget plan", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Your month, at a glance" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Budgets", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
  await expect(page.getByLabel("Food & dining monthly budget")).toBeVisible();
});
