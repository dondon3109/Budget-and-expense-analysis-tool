import {
  demoDashboard,
  demoTransactions,
  type BudgetMonthPlan,
  type AccountRecord,
  type CategoryRecord,
  type ImportPreviewRequest,
  type TransactionListItem,
  type TransactionPage,
} from "@budget/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { BudgetRepository } from "../src/db/budgets";
import type { AccountRepository } from "../src/db/accounts";
import type { CategoryRepository } from "../src/db/categories";
import type { ImportRepository } from "../src/db/imports";
import type { TransactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

const transactionItem: TransactionListItem = {
  ...demoTransactions[0]!,
  accountId: "account-everyday",
  notes: null,
};

const transactionPage: TransactionPage = {
  items: [transactionItem],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
};

const categoryItem: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
};

const accountItem: AccountRecord = {
  id: "account-everyday",
  name: "Everyday account",
  type: "checking",
  archived: false,
};

const budgetPlan: BudgetMonthPlan = {
  month: "2026-07-01",
  currency: "PHP",
  totalLimitMinor: 850_000,
  totalSpentMinor: 535_400,
  remainingMinor: 314_600,
  usedPercent: 63,
  items: [
    {
      categoryId: "food",
      categoryName: "Food & dining",
      categoryColor: "#dc8b3f",
      limitMinor: 850_000,
      spentMinor: 535_400,
      remainingMinor: 314_600,
      usedPercent: 63,
    },
  ],
};

function createTransactionStore(): TransactionRepository {
  return {
    list: vi.fn(async () => transactionPage),
    create: vi.fn(async () => transactionItem),
    update: vi.fn(async () => transactionItem),
    remove: vi.fn(async () => undefined),
    export: vi.fn(async () => [transactionItem]),
  };
}

function createCategoryStore(): CategoryRepository {
  return {
    list: vi.fn(async () => [categoryItem]),
    create: vi.fn(async () => categoryItem),
    update: vi.fn(async () => categoryItem),
  };
}

function createAccountStore(): AccountRepository {
  return { list: vi.fn(async () => [accountItem]) };
}

function createBudgetStore(): BudgetRepository {
  return {
    list: vi.fn(async () => budgetPlan),
    upsert: vi.fn(async () => budgetPlan),
  };
}

function createImportStore(): ImportRepository {
  return {
    preview: vi.fn(async (_env: Bindings, input: ImportPreviewRequest) => ({
      token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
      expiresAt: "2026-07-16T15:15:00.000Z",
      fileName: input.fileName,
      rowCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      duplicateCount: 0,
      rows: [],
    })),
    commit: vi.fn(async () => ({ importId: "import-1", importedCount: 1, rejectedCount: 0 })),
  };
}

describe("API foundation", () => {
  it("reports readiness", async () => {
    const app = createApp({ readinessCheck: vi.fn().mockResolvedValue(undefined) });
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("validates dashboard date ranges", async () => {
    const app = createApp({ dashboardLoader: vi.fn().mockResolvedValue(demoDashboard) });
    const response = await app.request("/api/dashboard?from=2026-08-01&to=2026-07-01", {});
    expect(response.status).toBe(400);
  });

  it("returns the shared dashboard contract", async () => {
    const loader = vi.fn().mockResolvedValue(demoDashboard);
    const app = createApp({ dashboardLoader: loader });
    const response = await app.request("/api/dashboard?from=2026-07-01&to=2026-07-31", {});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ currency: "PHP" });
  });

  it("rejects browser requests from an unapproved origin", async () => {
    const app = createApp({ dashboardLoader: vi.fn().mockResolvedValue(demoDashboard) });
    const response = await app.request("/api/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: { Origin: "https://untrusted.example" },
    });
    expect(response.status).toBe(403);
  });

  it("parses pagination and filters before listing transactions", async () => {
    const transactions = createTransactionStore();
    const app = createApp({ transactions });
    const response = await app.request(
      "/api/transactions?page=2&pageSize=5&kind=expense&accountId=account-everyday&search=rent",
    );
    expect(response.status).toBe(200);
    expect(transactions.list).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        page: 2,
        pageSize: 5,
        kind: "expense",
        accountId: "account-everyday",
        search: "rent",
      }),
    );
  });

  it("lists tenant-scoped accounts for transaction filters", async () => {
    const accounts = createAccountStore();
    const app = createApp({ accounts });
    const response = await app.request("/api/accounts");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [accountItem] });
    expect(accounts.list).toHaveBeenCalledOnce();
  });

  it("validates and creates a transaction", async () => {
    const transactions = createTransactionStore();
    const app = createApp({ transactions });
    const response = await app.request("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-07-18",
        description: "Weekend groceries",
        amountMinor: 245_50,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
      }),
    });
    expect(response.status).toBe(201);
    expect(transactions.create).toHaveBeenCalledOnce();
  });

  it("rejects an impossible date before reaching the repository", async () => {
    const transactions = createTransactionStore();
    const app = createApp({ transactions });
    const response = await app.request("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  it("rate-limits write requests before they reach a repository", async () => {
    const transactions = createTransactionStore();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 42,
      })),
    };
    const app = createApp({ transactions, rateLimiter });
    const response = await app.request("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.8" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    await expect(response.json()).resolves.toMatchObject({ error: "rate_limit_exceeded" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("returns stable not-found errors from write operations", async () => {
    const transactions = createTransactionStore();
    vi.mocked(transactions.update).mockRejectedValueOnce(
      new HttpError(404, "transaction_not_found", "Transaction not found."),
    );
    const app = createApp({ transactions });
    const response = await app.request("/api/transactions/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated" }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "transaction_not_found" });
  });

  it("preserves an intentional empty note when validating an update", async () => {
    const transactions = createTransactionStore();
    const app = createApp({ transactions });
    const response = await app.request("/api/transactions/transaction-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "" }),
    });
    expect(response.status).toBe(200);
    expect(transactions.update).toHaveBeenCalledWith(undefined, "transaction-1", { notes: "" });
  });

  it("lists and creates categories through validated routes", async () => {
    const categories = createCategoryStore();
    const app = createApp({ categories });
    const listResponse = await app.request("/api/categories");
    expect(listResponse.status).toBe(200);

    const createResponse = await app.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Health", kind: "expense", color: "#4f7faf" }),
    });
    expect(createResponse.status).toBe(201);
    expect(categories.create).toHaveBeenCalledOnce();
  });

  it("previews and commits an import through server-issued tokens", async () => {
    const imports = createImportStore();
    const app = createApp({ imports });
    const previewResponse = await app.request("/api/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const commitResponse = await app.request("/api/imports/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0" }),
    });
    expect(commitResponse.status).toBe(201);
    expect(imports.commit).toHaveBeenCalledOnce();
  });

  it("reads and atomically updates a monthly budget plan", async () => {
    const budgets = createBudgetStore();
    const app = createApp({ budgets });
    const listResponse = await app.request("/api/budgets?month=2026-07-01");
    expect(listResponse.status).toBe(200);

    const updateResponse = await app.request("/api/budgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-07-01",
        items: [{ categoryId: "food", limitMinor: 900_000 }],
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(budgets.upsert).toHaveBeenCalledOnce();
  });

  it("exports transactions using the validated active filters", async () => {
    const transactions = createTransactionStore();
    const app = createApp({ transactions });
    const response = await app.request(
      "/api/exports/transactions.csv?kind=expense&search=market&sortBy=amount&sortDirection=asc",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(transactions.export).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        kind: "expense",
        search: "market",
        sortBy: "amount",
        sortDirection: "asc",
      }),
    );
  });
});
