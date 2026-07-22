import { expect, test } from "@playwright/test";

test("landing page leads visitors to account creation or sign in", async ({ page, request }) => {
  const demoRequests: string[] = [];
  page.on("request", (browserRequest) => {
    if (browserRequest.url().includes("/api/demo/")) demoRequests.push(browserRequest.url());
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See where your money goes. Decide what comes next." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).toHaveAttribute(
    "href",
    "/signup",
  );
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(
    page.getByRole("img", { name: "Illustrative preview of the Clarity monthly dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("A calmer way to understand your money")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Import from the files you already use." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with Excel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your bank export" })).toBeVisible();
  await expect(page.getByText(/workspace begins without transactions or budgets/i)).toBeVisible();
  expect(demoRequests).toEqual([]);

  const retiredDemo = await request.get("/api/demo/dashboard?from=2026-07-01&to=2026-07-31");
  expect(retiredDemo.status()).toBe(404);
  const privateRead = await request.get("/api/app/dashboard?from=2026-07-01&to=2026-07-31");
  expect(privateRead.status()).toBe(401);
  const privateWrite = await request.post("/api/app/transactions", { data: {} });
  expect(privateWrite.status()).toBe(401);
});

test("retired demo route returns to the landing page", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "See where your money goes. Decide what comes next." }),
  ).toBeVisible();
});

test("private pages redirect signed-out users to login", async ({ page }) => {
  await page.goto("/app/transactions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Ftransactions$/);
  await expect(page.getByRole("heading", { name: "Sign in to Clarity" })).toBeVisible();

  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Ftransactions$/);

  await page.goto("/app/budgets");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fbudgets$/);

  await page.goto("/app/subscriptions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fsubscriptions$/);

  await page.goto("/subscriptions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fsubscriptions$/);
});
