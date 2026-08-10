import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zoption-theme", "light"));
});

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
    page.getByRole("img", { name: "Illustrative preview of the Zoption monthly dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("A calmer way to understand your money")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Import from the files you already use." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bring a bank or spreadsheet export." }),
  ).toBeVisible();

  const importSection = page.getByRole("region").filter({
    hasText: "Import from the files you already use.",
  });
  await expect(
    importSection.getByRole("heading", { name: "Import from the files you already use." }),
  ).toBeVisible();

  const formatsSection = page.getByRole("region").filter({
    hasText: "Bring a bank or spreadsheet export.",
  });
  await expect(
    formatsSection.getByRole("heading", { name: "Bring a bank or spreadsheet export." }),
  ).toBeVisible();
  const importBottom = await importSection.evaluate(
    (section) => section.getBoundingClientRect().bottom,
  );
  const formatsTop = await formatsSection.evaluate(
    (section) => section.getBoundingClientRect().top,
  );
  expect(formatsTop).toBeGreaterThanOrEqual(importBottom);
  await expect(
    formatsSection.getByRole("list", { name: "Supported institutions" }).getByRole("listitem"),
  ).toHaveText(["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"]);
  await expect(
    formatsSection.getByText(
      "Bank names are shown to indicate supported export formats only. Zoption is not affiliated with or endorsed by these institutions.",
    ),
  ).toBeVisible();

  const formatsTrack = formatsSection.locator(".formats-track");
  await expect
    .poll(() => formatsTrack.evaluate((track) => getComputedStyle(track).animationName))
    .toBe("formats-marquee");
  await expect(formatsTrack.locator(".formats-group")).toHaveCount(2);

  await expect(page.getByText(/workspace begins without transactions or budgets/i)).toBeVisible();
  expect(demoRequests).toEqual([]);

  const retiredDemo = await request.get("/api/demo/dashboard?from=2026-07-01&to=2026-07-31");
  expect(retiredDemo.status()).toBe(404);
  const privateRead = await request.get("/api/app/dashboard?from=2026-07-01&to=2026-07-31");
  expect(privateRead.status()).toBe(401);
  const privateWrite = await request.post("/api/app/transactions", { data: {} });
  expect(privateWrite.status()).toBe(401);
});

test("retired demo route renders the not-found page", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: "That page is not here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Zoption home" })).toHaveAttribute("href", "/");
});

test("Android download page renders as a public deep link with exact release guidance", async ({
  page,
}) => {
  await page.goto("/install");

  await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByRole("heading", { name: "Download Zoption for Android." })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Four steps from download to app icon." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
    "href",
    "/downloads/zoption-android-1.2.4.apk",
  );
  await expect(page.getByText(/does not receive bank credentials/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Online-first by design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the privacy policy" })).toHaveAttribute(
    "href",
    "/privacy-policy",
  );

  await page.getByRole("link", { name: "Read the privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByRole("heading", { name: "Download Zoption for Android." })).toBeVisible();
});

test("private pages redirect signed-out users to login", async ({ page }) => {
  const privatePaths = [
    "/app",
    "/app/assistant",
    "/app/calendar",
    "/app/transactions",
    "/app/import",
    "/app/budgets",
    "/app/subscriptions",
    "/app/plan",
    "/app/settings",
  ];

  for (const path of privatePaths) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?redirectTo=${encodeURIComponent(path)}$`));
    await expect(page.getByRole("heading", { name: "Sign in to Zoption" })).toBeVisible();
  }
});
