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
    page.getByRole("img", { name: "Illustrative preview of the Zoption monthly dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("A calmer way to understand your money")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Import from the files you already use." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with Excel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your bank export" })).toBeVisible();

  const importSection = page.getByRole("region", {
    name: "Import from the files you already use.",
  });
  await expect(importSection.locator(".import-support-inner")).toHaveCount(0);
  await expect
    .poll(() => importSection.evaluate((section) => getComputedStyle(section).backgroundImage))
    .toContain("linear-gradient");
  await expect
    .poll(() => importSection.evaluate((section) => getComputedStyle(section).backgroundImage))
    .not.toContain("url(");
  const featureCardStyle = await importSection
    .locator(".import-support-options article")
    .first()
    .evaluate((card) => {
      const style = getComputedStyle(card);
      return {
        borderWidth: Number.parseFloat(style.borderTopWidth),
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      };
    });
  expect(featureCardStyle.borderWidth).toBeGreaterThan(0);
  expect(featureCardStyle.borderRadius).toBeGreaterThan(0);

  const formatsHeading = page.getByRole("heading", { name: "Supported Export Formats" });
  await formatsHeading.scrollIntoViewIfNeeded();
  await expect(formatsHeading).toBeVisible();
  const formatsSection = page.getByRole("region", { name: "Supported Export Formats" });
  expect(
    await importSection.evaluate((section) => {
      const formats = document.querySelector(".supported-formats");
      return formats
        ? formats.getBoundingClientRect().top < section.getBoundingClientRect().bottom
        : false;
    }),
  ).toBe(true);
  await expect(
    formatsSection.getByRole("list", { name: "Supported institutions" }).getByRole("listitem"),
  ).toHaveText(["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"]);
  await expect(
    formatsSection.getByText(
      "Bank names are shown to indicate supported export formats only. Zoption is not affiliated with or endorsed by these institutions.",
    ),
  ).toBeVisible();
  await expect
    .poll(() =>
      formatsSection
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);

  const formatsTrack = formatsSection.locator(".supported-formats-track");
  await expect
    .poll(() => formatsTrack.evaluate((track) => getComputedStyle(track).animationName))
    .toBe("supported-formats-marquee");
  await expect(
    formatsSection.getByRole("button", { name: /supported export formats animation/i }),
  ).toHaveCount(0);

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
  await expect(page.getByRole("heading", { name: "Sign in to Zoption" })).toBeVisible();

  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Ftransactions$/);

  await page.goto("/app/calendar");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fcalendar$/);

  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fcalendar$/);

  await page.goto("/app/budgets");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fbudgets$/);

  await page.goto("/app/subscriptions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fsubscriptions$/);

  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fsettings$/);

  await page.goto("/subscriptions");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fsubscriptions$/);
});
