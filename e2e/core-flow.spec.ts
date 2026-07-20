import { expect, test } from "@playwright/test";

test("public demo is a read-only dashboard", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Open demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: "Your month, at a glance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Savings and recurring costs" })).toBeVisible();
  await expect(page.getByText("Apartment rent", { exact: true })).toBeVisible();
  await expect(page.getByText("You’re viewing sample data.", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Transactions" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Import" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Budgets" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Add transaction" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  const demoRead = await request.get("/api/demo/dashboard?from=2026-07-01&to=2026-07-31");
  expect(demoRead.ok()).toBe(true);
  const privateRead = await request.get("/api/app/dashboard?from=2026-07-01&to=2026-07-31");
  expect(privateRead.status()).toBe(401);
  const privateWrite = await request.post("/api/app/transactions", { data: {} });
  expect(privateWrite.status()).toBe(401);
});

test("private pages redirect signed-out users to login", async ({ page }) => {
  await page.goto("/app/transactions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Ftransactions$/);
  await expect(page.getByRole("heading", { name: "Sign in to Clarity" })).toBeVisible();

  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Ftransactions$/);

  await page.goto("/app/budgets");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fbudgets$/);
});
