import { expect, test, type APIRequestContext } from "@playwright/test";

const manualDescription = "E2E manual verification";
const importedDescription = "E2E imported verification";
const invalidDescription = "E2E invalid currency";

async function removeMatchingTransactions(request: APIRequestContext, search: string) {
  const response = await request.get(
    `/api/transactions?search=${encodeURIComponent(search)}&page=1&pageSize=50`,
  );
  if (!response.ok()) return;
  const page = (await response.json()) as { items: Array<{ id: string }> };
  await Promise.all(page.items.map((item) => request.delete(`/api/transactions/${item.id}`)));
}

test.afterEach(async ({ request }) => {
  await removeMatchingTransactions(request, "E2E");
  await request.put("/api/budgets", {
    data: { month: "2026-07-01", items: [{ categoryId: "food", limitMinor: 850_000 }] },
  });
});

test("complete demo workflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the sample dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Your month, at a glance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Savings and recurring costs" })).toBeVisible();
  await expect(page.getByText("Apartment rent", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add transaction" });
  await addDialog.getByLabel("Date").fill("2026-07-20");
  await addDialog.getByLabel("Description").fill(manualDescription);
  await addDialog.getByLabel("Amount (PHP)").fill("125.50");
  await addDialog.getByLabel("Category").selectOption("food");
  await addDialog.getByRole("button", { name: "Add transaction" }).click();

  await page.getByPlaceholder("Search descriptions").fill(manualDescription);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(manualDescription, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${manualDescription}` }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit transaction" });
  await editDialog.getByLabel("Category").selectOption("transport");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(
    page.locator("tbody tr").filter({ hasText: manualDescription }).getByText("Transport", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  const transportCategory = page.locator(".category-row").filter({ hasText: "Transport" });
  await expect(transportCategory.getByText("₱2,266", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByPlaceholder("Search descriptions").fill("");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByLabel("Filter by account").selectOption("account-savings");
  await expect(page.getByText("Transfer to savings", { exact: true })).toBeVisible();
  await page.getByLabel("Filter by account").selectOption("account-everyday");
  await page.getByPlaceholder("Search descriptions").fill(manualDescription);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(manualDescription, { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The exported CSV stream was unavailable.");
  stream.setEncoding("utf8");
  let exported = "";
  for await (const chunk of stream) {
    if (typeof chunk !== "string") throw new Error("The exported CSV was not UTF-8 text.");
    exported += chunk;
  }
  expect(exported).toContain(manualDescription);
  expect(exported).toContain(",Transport,");

  await page.getByRole("button", { name: `Delete ${manualDescription}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(manualDescription, { exact: true })).not.toBeVisible();

  await page.getByRole("link", { name: "Import" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Date,Description,Amount,Currency,Type,Category",
        `2026-07-21,${importedDescription},-75.00,PHP,expense,Food & dining`,
        `2026-07-22,${invalidDescription},-25.00,USD,expense,Food & dining`,
      ].join("\n"),
    ),
  });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.locator(".import-status.ready")).toBeVisible();
  const invalidRow = page.locator("tbody tr").filter({ hasText: invalidDescription });
  await expect(invalidRow.locator(".import-status.invalid")).toBeVisible();
  await expect(invalidRow.getByText("Currency must be PHP.")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 ready rows" }).click();
  await expect(page.getByRole("heading", { name: "1 transaction added" })).toBeVisible();
  await expect(page.getByText("1 rejected row was not saved.")).toBeVisible();

  await page.getByRole("link", { name: "Budgets" }).click();
  const foodBudget = page.getByLabel("Food & dining monthly budget");
  await expect(foodBudget).toHaveValue("8500.00");
  await foodBudget.fill("8600.00");
  await page.getByRole("button", { name: "Save monthly plan" }).click();
  await expect(page.getByText("Monthly plan saved and dashboard refreshed.")).toBeVisible();
  await expect(page.getByText("₱41,600", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  const foodProgress = page.locator(".budget-row").filter({ hasText: "Food & dining" });
  await expect(foodProgress.getByText("₱5,429 of ₱8,600", { exact: true })).toBeVisible();
});
