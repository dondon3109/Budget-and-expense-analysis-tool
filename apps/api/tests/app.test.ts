import {
  type AccountRecord,
  type BudgetMonthPlan,
  type CategoryRecord,
  type DashboardSummary,
  type ImportPreviewRequest,
  type SubscriptionMonthSummary,
  type SubscriptionRecord,
  type TransactionListItem,
  type TransactionPage,
} from "@budget/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp, type AppOptions } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import type { AccountRepository } from "../src/db/accounts";
import type { BudgetRepository } from "../src/db/budgets";
import type { CategoryRepository } from "../src/db/categories";
import type { ImportRepository } from "../src/db/imports";
import type { SubscriptionRepository } from "../src/db/subscriptions";
import type { TenantResolver } from "../src/db/tenants";
import type { TransactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const TENANT_ID = "user:user-1";

const transactionItem: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-18",
  description: "Weekend groceries",
  amountMinor: -245_50,
  currency: "PHP",
  kind: "expense",
  categoryId: "food",
  categoryName: "Food & dining",
  categoryColor: "#dc8b3f",
  accountId: "account-everyday",
  accountName: "Everyday account",
  notes: null,
};

const dashboardFixture: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  metrics: {
    moneyInMinor: 80_000_00,
    moneyOutMinor: 24_550,
    netMinor: 79_754_50,
    budgetLimitMinor: 850_000,
    remainingBudgetMinor: 825_450,
    budgetUsedPercent: 2.9,
  },
  spendingByCategory: [
    {
      categoryId: "food",
      name: "Food & dining",
      color: "#dc8b3f",
      amountMinor: 24_550,
      sharePercent: 100,
    },
  ],
  monthlyTrend: [{ month: "2026-07", incomeMinor: 80_000_00, expenseMinor: 24_550 }],
  budgetProgress: [
    {
      categoryId: "food",
      name: "Food & dining",
      color: "#dc8b3f",
      spentMinor: 24_550,
      limitMinor: 850_000,
      remainingMinor: 825_450,
      usedPercent: 2.9,
    },
  ],
  insights: { savingsMinor: 79_754_50, savingsRatePercent: 99.7, recurringExpenses: [] },
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
  system: false,
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

const subscriptionItem: SubscriptionRecord = {
  id: "subscription-1",
  name: "Music streaming",
  amountMinor: 199_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-07-25",
  status: "active",
  categoryId: "food",
  categoryName: "Food & dining",
  categoryColor: "#dc8b3f",
};

const subscriptionSummary: SubscriptionMonthSummary = {
  month: "2026-07-01",
  currency: "PHP",
  totalMonthlyCostMinor: 199_00,
  items: [{ ...subscriptionItem, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
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

function createSubscriptionStore(): SubscriptionRepository {
  return {
    list: vi.fn(async () => subscriptionSummary),
    create: vi.fn(async () => subscriptionItem),
    setStatus: vi.fn(async () => ({ ...subscriptionItem, status: "canceled" as const })),
  };
}

function createImportStore(): ImportRepository {
  return {
    preview: vi.fn(async (_env: Bindings, _tenantId: string, input: ImportPreviewRequest) => ({
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

function createAuthVerifier(): AuthVerifier {
  return {
    verify: vi.fn(async (_env, token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return { id: "user-1", email: "person@example.com", role: "authenticated" };
    }),
  };
}

function createTenantResolver(): TenantResolver {
  return {
    resolve: vi.fn(async () => ({
      tenantId: TENANT_ID,
      defaultAccountId: `${TENANT_ID}:account:default`,
    })),
  };
}

function createAllowedRateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

function createTestApp(options: AppOptions = {}) {
  return createApp({
    readinessCheck: vi.fn().mockResolvedValue(undefined),
    authVerifier: createAuthVerifier(),
    tenantResolver: createTenantResolver(),
    rateLimiter: createAllowedRateLimiter(),
    ...options,
  });
}

function privateHeaders(additional: Record<string, string> = {}) {
  return { ...AUTHORIZATION, ...additional };
}

describe("API foundation", () => {
  it("reports readiness", async () => {
    const app = createTestApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("does not expose the retired public dashboard", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const app = createTestApp({ dashboardLoader: loader });
    const response = await app.request("/api/demo/dashboard?from=2026-07-01&to=2026-07-31");
    expect(response.status).toBe(404);
    expect(loader).not.toHaveBeenCalled();
  });

  it("validates dashboard date ranges", async () => {
    const app = createTestApp({ dashboardLoader: vi.fn().mockResolvedValue(dashboardFixture) });
    const response = await app.request("/api/app/dashboard?from=2026-08-01&to=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(400);
  });

  it("requires authentication for private routes", async () => {
    const app = createTestApp();
    const response = await app.request("/api/app/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("rejects invalid bearer tokens before resolving a tenant", async () => {
    const tenantResolver = createTenantResolver();
    const app = createTestApp({ tenantResolver });
    const response = await app.request("/api/app/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(response.status).toBe(401);
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it("returns the authenticated user and resolved tenant", async () => {
    const app = createTestApp();
    const response = await app.request("/api/app/me", { headers: AUTHORIZATION });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "person@example.com",
        role: "authenticated",
      },
      tenantId: TENANT_ID,
    });
  });

  it("answers CORS preflight before authentication and allows Authorization", async () => {
    const authVerifier = createAuthVerifier();
    const app = createTestApp({ authVerifier });
    const response = await app.request("/api/app/transactions", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(authVerifier.verify).not.toHaveBeenCalled();
  });

  it("rejects browser requests from an unapproved origin", async () => {
    const app = createTestApp({ dashboardLoader: vi.fn().mockResolvedValue(dashboardFixture) });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: { Origin: "https://untrusted.example" },
    });
    expect(response.status).toBe(403);
  });

  it("loads the private dashboard for the resolved tenant", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const app = createTestApp({ dashboardLoader: loader });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("parses pagination and filters before listing tenant transactions", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
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

  it("lists accounts for the resolved tenant", async () => {
    const accounts = createAccountStore();
    const app = createTestApp({ accounts });
    const response = await app.request("/api/app/accounts", { headers: AUTHORIZATION });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [accountItem] });
    expect(accounts.list).toHaveBeenCalledWith(undefined, TENANT_ID);
  });

  it("validates and creates a tenant transaction", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
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
    const app = createTestApp({ transactions });
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

  it("rate-limits authenticated writes by resolved tenant", async () => {
    const transactions = createTransactionStore();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 42,
      })),
    };
    const app = createTestApp({ transactions, rateLimiter });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-write",
      limit: 60,
      windowSeconds: 60,
    });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("uses the import-specific tenant rate limit", async () => {
    const imports = createImportStore();
    const rateLimiter = createAllowedRateLimiter();
    const app = createTestApp({ imports, rateLimiter });
    await app.request("/api/app/imports/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-import",
      limit: 20,
      windowSeconds: 900,
    });
  });

  it("returns stable not-found errors from write operations", async () => {
    const transactions = createTransactionStore();
    vi.mocked(transactions.update).mockRejectedValueOnce(
      new HttpError(404, "transaction_not_found", "Transaction not found."),
    );
    const app = createTestApp({ transactions });
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
    const app = createTestApp({ transactions });
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
    const app = createTestApp({ categories });
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
    const app = createTestApp({ imports });
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
      body: JSON.stringify({ token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0" }),
    });
    expect(commitResponse.status).toBe(201);
    expect(imports.preview).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(Object));
    expect(imports.commit).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
    );
  });

  it("accepts a fallback import date without a Category mapping", async () => {
    const imports = createImportStore();
    const app = createTestApp({ imports });
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
    const app = createTestApp({ imports });
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
    const app = createTestApp({ budgets });
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

  it("lists, creates, and updates subscriptions for the resolved tenant", async () => {
    const subscriptions = createSubscriptionStore();
    const app = createTestApp({ subscriptions });

    const listResponse = await app.request("/api/app/subscriptions?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(200);
    expect(subscriptions.list).toHaveBeenCalledWith(undefined, TENANT_ID, "2026-07-01");

    const createResponse = await app.request("/api/app/subscriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Music streaming",
        amountMinor: 199_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "food",
      }),
    });
    expect(createResponse.status).toBe(201);
    expect(subscriptions.create).toHaveBeenCalledWith(undefined, TENANT_ID, {
      name: "Music streaming",
      amountMinor: 199_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "food",
    });

    const statusResponse = await app.request("/api/app/subscriptions/subscription-1/status", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "canceled" }),
    });
    expect(statusResponse.status).toBe(200);
    expect(subscriptions.setStatus).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1", {
      status: "canceled",
    });
  });

  it("rejects invalid subscription months and fields before repository access", async () => {
    const subscriptions = createSubscriptionStore();
    const app = createTestApp({ subscriptions });

    const listResponse = await app.request("/api/app/subscriptions?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(400);
    expect(subscriptions.list).not.toHaveBeenCalled();

    const createResponse = await app.request("/api/app/subscriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Invalid",
        amountMinor: 0,
        billingCycle: "weekly",
        nextBillingDate: "2026-02-30",
        categoryId: "food",
      }),
    });
    expect(createResponse.status).toBe(400);
    expect(subscriptions.create).not.toHaveBeenCalled();
  });

  it("exports transactions using tenant scope and active filters", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
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
