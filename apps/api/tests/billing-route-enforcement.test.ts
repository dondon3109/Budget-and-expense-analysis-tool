import type {
  AccountRecord,
  CashflowTrend,
  CategoryRecord,
  TransactionListItem,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import type { AccountRepository } from "../src/db/accounts";
import type { BillingRepository } from "../src/db/billing";
import type { CategoryRepository } from "../src/db/categories";
import type { TenantResolver } from "../src/db/tenants";
import type { TransactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";

const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const JSON_HEADERS = { ...AUTHORIZATION, "Content-Type": "application/json" };
const TENANT_ID = "user:user-1";

const account: AccountRecord = {
  id: "account-1",
  name: "Everyday",
  type: "checking",
  currency: "PHP",
  balanceMinor: 0,
  archived: false,
  system: false,
};

const category: CategoryRecord = {
  id: "category-1",
  name: "Health",
  kind: "expense",
  color: "#4f7faf",
  archived: false,
  system: false,
};

const exportedTransaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-18",
  description: "Groceries",
  amountMinor: -2_455,
  currency: "PHP",
  kind: "expense",
  categoryId: category.id,
  categoryName: category.name,
  categoryColor: category.color,
  accountId: account.id,
  accountName: account.name,
  notes: null,
};

const cashflow: CashflowTrend = {
  view: "weekly",
  granularity: "day",
  range: { from: "2026-07-21", to: "2026-07-27" },
  points: [],
};

function authVerifier(): AuthVerifier {
  return {
    verify: vi.fn(async () => ({
      id: "user-1",
      email: "person@example.com",
      role: "authenticated",
    })),
  };
}

function tenantResolver(): TenantResolver {
  return {
    resolve: vi.fn(async () => ({
      tenantId: TENANT_ID,
      defaultAccountId: `${TENANT_ID}:account:default`,
    })),
  };
}

function rateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

function billing(requirePro: ReturnType<typeof vi.fn>): BillingRepository {
  return { requirePro } as unknown as BillingRepository;
}

function accounts(): AccountRepository {
  return {
    list: vi.fn(async () => [account]),
    create: vi.fn(async () => account),
    update: vi.fn(async () => account),
    remove: vi.fn(async () => undefined),
  };
}

function categories(): CategoryRepository {
  return {
    list: vi.fn(async () => [category]),
    create: vi.fn(async () => category),
    update: vi.fn(async () => category),
  };
}

function transactions(): TransactionRepository {
  return {
    list: vi.fn(),
    calendar: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    export: vi.fn(async () => [exportedTransaction]),
  };
}

function testApp(options: Parameters<typeof createApp>[0]) {
  return createApp({
    readinessCheck: vi.fn(async () => undefined),
    authVerifier: authVerifier(),
    tenantResolver: tenantResolver(),
    rateLimiter: rateLimiter(),
    ...options,
  });
}

describe("Pro route enforcement", () => {
  it.each([
    {
      name: "category creation",
      request: {
        path: "/api/app/categories",
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Health", kind: "expense", color: "#4f7faf" }),
        },
      },
      repositoryCall: "category.create" as const,
      capability: "category_management" as const,
    },
    {
      name: "category update",
      request: {
        path: "/api/app/categories/category-1",
        init: {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Medical" }),
        },
      },
      repositoryCall: "category.update" as const,
      capability: "category_management" as const,
    },
    {
      name: "account creation",
      request: {
        path: "/api/app/accounts",
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Savings", type: "savings" }),
        },
      },
      repositoryCall: "account.create" as const,
      capability: "account_management" as const,
    },
    {
      name: "account update",
      request: {
        path: "/api/app/accounts/account-1",
        init: {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: "Daily" }),
        },
      },
      repositoryCall: "account.update" as const,
      capability: "account_management" as const,
    },
    {
      name: "account deletion",
      request: {
        path: "/api/app/accounts/account-1",
        init: { method: "DELETE", headers: AUTHORIZATION },
      },
      repositoryCall: "account.remove" as const,
      capability: "account_management" as const,
    },
    {
      name: "transaction export",
      request: {
        path: "/api/app/exports/transactions.csv",
        init: { headers: AUTHORIZATION },
      },
      repositoryCall: "transaction.export" as const,
      capability: "transaction_export" as const,
    },
  ])("denies $name before its repository", async ({ request, repositoryCall, capability }) => {
    const requirePro = vi.fn(async () => {
      throw new HttpError(403, "pro_plan_required", "Upgrade to Zoption Pro to use this feature.");
    });
    const stores = {
      accounts: accounts(),
      categories: categories(),
      transactions: transactions(),
    };
    const app = testApp({ billing: billing(requirePro), ...stores });

    const response = await app.request(request.path, request.init);

    expect(response.status).toBe(403);
    expect(requirePro).toHaveBeenCalledWith(undefined, TENANT_ID, capability);
    const repositoryMethod =
      repositoryCall === "account.create"
        ? vi.mocked(stores.accounts.create!)
        : repositoryCall === "account.update"
          ? vi.mocked(stores.accounts.update!)
          : repositoryCall === "account.remove"
            ? vi.mocked(stores.accounts.remove!)
            : repositoryCall === "category.create"
              ? vi.mocked(stores.categories.create)
              : repositoryCall === "category.update"
                ? vi.mocked(stores.categories.update)
                : vi.mocked(stores.transactions.export);
    expect(repositoryMethod).not.toHaveBeenCalled();
  });

  it("denies cashflow trend loading before the loader", async () => {
    const requirePro = vi.fn(async () => {
      throw new HttpError(403, "pro_plan_required", "Upgrade to Zoption Pro to use this feature.");
    });
    const loader = vi.fn(async () => cashflow);
    const app = testApp({ billing: billing(requirePro), cashflowTrendLoader: loader });

    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(403);
    expect(requirePro).toHaveBeenCalledWith(undefined, TENANT_ID, "cashflow_analytics");
    expect(loader).not.toHaveBeenCalled();
  });

  it("checks Pro before category and account writes", async () => {
    const requirePro = vi.fn(async () => undefined);
    const accountStore = accounts();
    const categoryStore = categories();
    const app = testApp({
      billing: billing(requirePro),
      accounts: accountStore,
      categories: categoryStore,
    });

    const categoryResponse = await app.request("/api/app/categories", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Health", kind: "expense", color: "#4f7faf" }),
    });
    const accountResponse = await app.request("/api/app/accounts", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Savings", type: "savings" }),
    });

    expect(categoryResponse.status).toBe(201);
    expect(accountResponse.status).toBe(201);
    expect(requirePro).toHaveBeenNthCalledWith(1, undefined, TENANT_ID, "category_management");
    expect(requirePro).toHaveBeenNthCalledWith(2, undefined, TENANT_ID, "account_management");
    expect(requirePro.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(categoryStore.create).mock.invocationCallOrder[0]!,
    );
    expect(requirePro.mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(accountStore.create!).mock.invocationCallOrder[0]!,
    );
  });

  it("checks Pro before export repositories and cashflow loaders", async () => {
    const requirePro = vi.fn(async () => undefined);
    const transactionStore = transactions();
    const loader = vi.fn(async () => cashflow);
    const app = testApp({
      billing: billing(requirePro),
      transactions: transactionStore,
      cashflowTrendLoader: loader,
    });

    const exportResponse = await app.request("/api/app/exports/transactions.csv", {
      headers: AUTHORIZATION,
    });
    const cashflowResponse = await app.request(
      "/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(exportResponse.status).toBe(200);
    expect(cashflowResponse.status).toBe(200);
    expect(requirePro.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(transactionStore.export).mock.invocationCallOrder[0]!,
    );
    expect(requirePro.mock.invocationCallOrder[1]).toBeLessThan(
      loader.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps account and category reads available without a Pro check", async () => {
    const requirePro = vi.fn(async () => {
      throw new Error("reads must not require Pro");
    });
    const accountStore = accounts();
    const categoryStore = categories();
    const app = testApp({
      billing: billing(requirePro),
      accounts: accountStore,
      categories: categoryStore,
    });

    const accountResponse = await app.request("/api/app/accounts", { headers: AUTHORIZATION });
    const categoryResponse = await app.request("/api/app/categories", { headers: AUTHORIZATION });

    expect(accountResponse.status).toBe(200);
    expect(categoryResponse.status).toBe(200);
    expect(accountStore.list).toHaveBeenCalledWith(undefined, TENANT_ID);
    expect(categoryStore.list).toHaveBeenCalledWith(undefined, TENANT_ID, false);
    expect(requirePro).not.toHaveBeenCalled();
  });
});
