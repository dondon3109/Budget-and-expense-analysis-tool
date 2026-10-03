import { describe, expect, it, vi } from "vitest";

import type { BillingRepository } from "../src/db/billing";
import { HttpError } from "../src/errors";
import {
  AUTHORIZATION,
  TENANT_ID,
  transactionCalendar,
  accountItem,
  createTransactionStore,
  createCategoryStore,
  createAccountStore,
  createBudgetStore,
  createImportStore,
  createAllowedBillingRepository,
  createAppWithFakes,
  privateHeaders,
} from "./helpers/app-fakes";

describe("API ledger routes", () => {
  it("parses pagination and filters before listing tenant transactions", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request(
      "/api/app/transactions?page=2&pageSize=5&kind=expense&accountId=account-everyday&search=rent",
      { headers: AUTHORIZATION },
    );
    expect(response.status).toBe(200);
    expect(transactions.list).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({
        page: 2,
        pageSize: 5,
        kind: "expense",
        accountId: "account-everyday",
        search: "rent",
      }),
    );
  });

  it("loads a complete calendar month for the resolved tenant", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions/calendar?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(transactionCalendar);
    expect(transactions.calendar).toHaveBeenCalledWith(undefined, TENANT_ID, {
      month: "2026-07-01",
    });
  });

  it("rejects an invalid calendar month before reaching the repository", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions/calendar?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(400);
    expect(transactions.calendar).not.toHaveBeenCalled();
  });

  it("lists accounts for the resolved tenant", async () => {
    const accounts = createAccountStore();
    const app = createAppWithFakes({ accounts });
    const response = await app.request("/api/app/accounts", { headers: AUTHORIZATION });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [accountItem] });
    expect(accounts.list).toHaveBeenCalledWith(undefined, TENANT_ID);
  });

  it("updates an account type and interest settings atomically", async () => {
    const accounts = createAccountStore();
    const app = createAppWithFakes({ accounts });
    const interest = {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly" as const,
      payDay: 15,
    };
    const response = await app.request("/api/app/accounts/account-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "Maya Wallet", type: "savings", interest }),
    });
    expect(response.status).toBe(200);
    expect(accounts.update).toHaveBeenCalledWith(undefined, TENANT_ID, "account-1", {
      name: "Maya Wallet",
      type: "savings",
      interest,
    });
    expect(accounts.updateInterest).not.toHaveBeenCalled();
  });

  it("updates interest settings on a savings account", async () => {
    const accounts = createAccountStore();
    const app = createAppWithFakes({ accounts });
    const input = {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 15,
    };
    const response = await app.request("/api/app/accounts/account-1/interest", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect(accounts.updateInterest).toHaveBeenCalledWith(undefined, TENANT_ID, "account-1", input);
  });

  it("rejects invalid interest settings", async () => {
    const accounts = createAccountStore();
    const app = createAppWithFakes({ accounts });
    // Daily interest must not carry a pay day.
    const response = await app.request("/api/app/accounts/account-1/interest", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "daily",
        payDay: 15,
      }),
    });
    expect(response.status).toBe(400);
    expect(accounts.updateInterest).not.toHaveBeenCalled();
  });

  it("requires Pro to update interest settings", async () => {
    const accounts = createAccountStore();
    const requirePro = vi.fn();
    requirePro.mockRejectedValue(
      new HttpError(403, "upgrade_required", "This feature requires Zoption Pro.", {
        requested: "account_interest",
        requiredPlan: "zoption_pro",
      }),
    );
    const billing: BillingRepository = {
      ...createAllowedBillingRepository(),
      requirePro,
    };
    const app = createAppWithFakes({ accounts, billing });
    const response = await app.request("/api/app/accounts/account-1/interest", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      }),
    });
    expect(response.status).toBe(403);
    expect(accounts.updateInterest).not.toHaveBeenCalled();
  });

  it("validates and creates a tenant transaction", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        date: "2026-07-18",
        description: "Weekend groceries",
        amountMinor: 245_50,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
        accountId: "account-1",
      }),
    });
    expect(response.status).toBe(201);
    expect(transactions.create).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({ description: "Weekend groceries" }),
    );
  });

  it("rejects an impossible date before reaching the repository", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        date: "2026-02-30",
        description: "Impossible",
        amountMinor: 500,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
      }),
    });
    expect(response.status).toBe(400);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("returns stable not-found errors from write operations", async () => {
    const transactions = createTransactionStore();
    vi.mocked(transactions.update).mockRejectedValueOnce(
      new HttpError(404, "transaction_not_found", "Transaction not found."),
    );
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions/missing", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ description: "Updated" }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "transaction_not_found" });
  });

  it("preserves an intentional empty note when validating an update", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions/transaction-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ notes: "" }),
    });
    expect(response.status).toBe(200);
    expect(transactions.update).toHaveBeenCalledWith(undefined, TENANT_ID, "transaction-1", {
      notes: "",
    });
  });

  it("lists and creates categories for the resolved tenant", async () => {
    const categories = createCategoryStore();
    const app = createAppWithFakes({ categories });
    const listResponse = await app.request("/api/app/categories", { headers: AUTHORIZATION });
    expect(listResponse.status).toBe(200);

    const createResponse = await app.request("/api/app/categories", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "Health", kind: "expense", color: "#4f7faf" }),
    });
    expect(createResponse.status).toBe(201);
    expect(categories.create).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({ name: "Health" }),
    );
  });

  it("previews and commits an import for the resolved tenant", async () => {
    const imports = createImportStore();
    const app = createAppWithFakes({ imports });
    const previewResponse = await app.request("/api/app/imports/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileName: "transactions.csv",
        csvText: "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,Food & dining",
        mapping: {
          date: "Date",
          description: "Description",
          amount: "Amount",
          category: "Category",
        },
      }),
    });
    expect(previewResponse.status).toBe(200);

    const commitResponse = await app.request("/api/app/imports/commit", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
        categoryOverrides: [{ rowNumber: 2, categoryId: "food" }],
        kindOverrides: [{ rowNumber: 2, kind: "expense" }],
      }),
    });
    expect(commitResponse.status).toBe(201);
    expect(imports.preview).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(Object));
    expect(imports.commit).toHaveBeenCalledWith(undefined, TENANT_ID, {
      token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
      categoryOverrides: [{ rowNumber: 2, categoryId: "food" }],
      kindOverrides: [{ rowNumber: 2, kind: "expense" }],
    });
  });

  it("accepts a fallback import date without a Category mapping", async () => {
    const imports = createImportStore();
    const app = createAppWithFakes({ imports });
    const response = await app.request("/api/app/imports/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileName: "transactions.csv",
        csvText: "Description,Amount\nMarket,-50.00",
        mapping: { description: "Description", amount: "Amount" },
        fallbackDate: "2026-07-21",
      }),
    });

    expect(response.status).toBe(200);
    expect(imports.preview).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({ fallbackDate: "2026-07-21" }),
    );
  });

  it("rejects imports with no date source", async () => {
    const imports = createImportStore();
    const app = createAppWithFakes({ imports });
    const response = await app.request("/api/app/imports/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileName: "transactions.csv",
        csvText: "Description,Amount\nMarket,-50.00",
        mapping: { description: "Description", amount: "Amount" },
      }),
    });

    expect(response.status).toBe(400);
    expect(imports.preview).not.toHaveBeenCalled();
  });

  it("reads and atomically updates a monthly budget plan", async () => {
    const budgets = createBudgetStore();
    const app = createAppWithFakes({ budgets });
    const listResponse = await app.request("/api/app/budgets?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(200);

    const updateResponse = await app.request("/api/app/budgets", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        month: "2026-07-01",
        items: [{ categoryId: "food", limitMinor: 900_000 }],
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(budgets.upsert).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({ month: "2026-07-01" }),
    );
  });

  it("exports transactions using tenant scope and active filters", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request(
      "/api/app/exports/transactions.csv?kind=expense&search=market&sortBy=amount&sortDirection=asc",
      { headers: AUTHORIZATION },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(transactions.export).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.objectContaining({
        kind: "expense",
        search: "market",
        sortBy: "amount",
        sortDirection: "asc",
      }),
    );
  });
});
