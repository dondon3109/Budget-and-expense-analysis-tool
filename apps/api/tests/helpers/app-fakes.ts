import type {
  AccountBalanceUpdate,
  AccountInterestUpdate,
  AccountRecord,
  AccountUpdateWithInterest,
  BudgetMonthPlan,
  CalendarEventMonth,
  CalendarEventRecord,
  CategoryRecord,
  CustomerReview,
  CustomerReviewAdminDashboard,
  PublicCustomerReview,
  DashboardSummary,
  ImportPreviewRequest,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  TransactionCalendarMonth,
  TransactionListItem,
  TransactionPage,
} from "@zoption/shared";
import { vi } from "vitest";

import type { AccountDeletionService } from "../../src/account-deletion";
import { createApp, type AppOptions } from "../../src/app";
import type { AuthVerifier } from "../../src/auth";
import type { AccountRepository } from "../../src/db/accounts";
import type { BillingRepository } from "../../src/db/billing";
import type { BudgetRepository } from "../../src/db/budgets";
import type { CategoryRepository } from "../../src/db/categories";
import type { CustomerReviewRepository } from "../../src/db/customer-reviews";
import type { CalendarEventRepository } from "../../src/db/events";
import type { ImportRepository } from "../../src/db/imports";
import type { SubscriptionRepository } from "../../src/db/subscriptions";
import type { TenantResolver } from "../../src/db/tenants";
import type { TransactionRepository } from "../../src/db/transactions";
import type { RateLimiter } from "../../src/rate-limit";
import type { Bindings } from "../../src/types";

// Fixtures and fake dependencies for the createApp route suites (app-*.test.ts). Each fake store
// is a fresh set of vi.fn spies, so a test can assert on or override one without leaking.

export const AUTHORIZATION = { Authorization: "Bearer valid-token" };
export const TENANT_ID = "user:user-1";
export const customerReviewFixture: CustomerReview = {
  id: "00000000-0000-4000-8000-000000000099",
  displayName: "Don",
  rating: 5,
  review: "Zoption gives me a much clearer view of my monthly spending.",
  publishConsent: true,
  moderationStatus: "pending",
  featuredOrder: null,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};
export const publicCustomerReviewFixture: PublicCustomerReview = {
  id: customerReviewFixture.id,
  displayName: customerReviewFixture.displayName,
  rating: customerReviewFixture.rating,
  review: customerReviewFixture.review,
  featuredOrder: 1,
  updatedAt: customerReviewFixture.updatedAt,
};
export const customerReviewAdminDashboard: CustomerReviewAdminDashboard = {
  items: [customerReviewFixture],
  lineup: [],
  summary: { total: 1, pending: 1, published: 0, hidden: 0, featured: 0 },
  page: 1,
  pageSize: 50,
  totalFiltered: 1,
  totalPages: 1,
};

export const transactionItem: TransactionListItem = {
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

export const cashflowTrendFixture = {
  view: "sixMonth" as const,
  granularity: "month" as const,
  range: { from: "2026-02-01", to: "2026-07-31" },
  points: [{ date: "2026-07-01", incomeMinor: 80_000_00, expenseMinor: 24_550 }],
};

export const dashboardFixture: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  metrics: {
    moneyInMinor: 80_000_00,
    moneyOutMinor: 24_550,
    netMinor: 79_754_50,
    incomeByCurrency: { PHP: 80_000_00, USD: 0 },
    expenseByCurrency: { PHP: 24_550, USD: 0 },
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

export const transactionPage: TransactionPage = {
  items: [transactionItem],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
};

export const transactionCalendar: TransactionCalendarMonth = {
  month: "2026-07-01",
  currency: "PHP",
  items: [transactionItem],
  hasAnyTransactions: true,
};

export const calendarEventItem: CalendarEventRecord = {
  id: "event-1",
  title: "Dentist",
  date: "2026-07-22",
  startTime: "09:30",
  endTime: "10:15",
  notes: "Bring insurance card",
};

export const calendarEventMonth: CalendarEventMonth = {
  month: "2026-07-01",
  items: [calendarEventItem],
};

export const categoryItem: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
  system: false,
  origin: "custom",
  requiredPlan: "free",
  locked: false,
};

export const accountItem: AccountRecord = {
  id: "account-everyday",
  name: "Everyday account",
  type: "checking",
  currency: "PHP",
  balanceMinor: null,
  balanceAsOf: null,
  archived: false,
};

export const budgetPlan: BudgetMonthPlan = {
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

export const subscriptionItem: SubscriptionRecord = {
  id: "subscription-1",
  name: "Music streaming",
  amountMinor: 199_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-07-25",
  status: "active",
  renewalBlockedReason: null,
  categoryId: "food",
  categoryName: "Food & dining",
  categoryColor: "#dc8b3f",
  accountId: "account-bank",
  accountName: "Bank",
};

export const subscriptionSummary: SubscriptionMonthSummary = {
  month: "2026-07-01",
  currency: "PHP",
  totalMonthlyCostMinor: 199_00,
  items: [{ ...subscriptionItem, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
};

export function createTransactionStore(): TransactionRepository {
  return {
    list: vi.fn(async () => transactionPage),
    calendar: vi.fn(async () => transactionCalendar),
    create: vi.fn(async () => transactionItem),
    update: vi.fn(async () => transactionItem),
    remove: vi.fn(async () => undefined),
    export: vi.fn(async () => [transactionItem]),
  };
}

export function createCategoryStore(): CategoryRepository {
  return {
    list: vi.fn(async () => [categoryItem]),
    create: vi.fn(async () => categoryItem),
    update: vi.fn(async () => categoryItem),
  };
}

export function createAccountStore(): AccountRepository {
  return {
    list: vi.fn(async () => [accountItem]),
    update: vi.fn(
      async (
        _env: Bindings,
        _tenantId: string,
        _accountId: string,
        input: AccountUpdateWithInterest,
      ): Promise<AccountRecord> => ({
        ...accountItem,
        ...input,
      }),
    ),
    setBalance: vi.fn(
      async (
        _env: Bindings,
        _tenantId: string,
        _accountId: string,
        input: AccountBalanceUpdate,
      ): Promise<AccountRecord> => ({
        ...accountItem,
        ...input,
      }),
    ),
    updateInterest: vi.fn(
      async (
        _env: Bindings,
        _tenantId: string,
        _accountId: string,
        input: AccountInterestUpdate,
      ): Promise<AccountRecord> => ({
        ...accountItem,
        interest: {
          enabled: input.enabled,
          annualRateBasisPoints: input.annualRateBasisPoints,
          frequency: input.frequency,
          payDay: input.payDay,
        },
      }),
    ),
  };
}

export function createBudgetStore(): BudgetRepository {
  return {
    list: vi.fn(async () => budgetPlan),
    upsert: vi.fn(async () => budgetPlan),
  };
}

export function createSubscriptionStore(): SubscriptionRepository {
  return {
    list: vi.fn(async () => subscriptionSummary),
    create: vi.fn(async () => subscriptionItem),
    update: vi.fn(async () => subscriptionItem),
    setStatus: vi.fn(async () => ({ ...subscriptionItem, status: "canceled" as const })),
    remove: vi.fn(async () => undefined),
    listDueRenewals: vi.fn(async () => []),
    postRenewalCharge: vi.fn(async () => false),
    advanceRenewalSchedule: vi.fn(async () => false),
    markRenewalBlocked: vi.fn(async () => undefined),
    createRenewalNotification: vi.fn(async () => false),
    claimRenewalNotification: vi.fn(async () => null),
    claimPendingRenewalNotifications: vi.fn(async () => []),
    finishRenewalNotification: vi.fn(async () => undefined),
  };
}

export function createCalendarEventStore(): CalendarEventRepository {
  return {
    list: vi.fn(async () => calendarEventMonth),
    create: vi.fn(async () => calendarEventItem),
    update: vi.fn(async () => calendarEventItem),
    remove: vi.fn(async () => undefined),
  };
}

export function createImportStore(): ImportRepository {
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

export function createCustomerReviewStore(): CustomerReviewRepository {
  return {
    listPublic: vi.fn(async () => [publicCustomerReviewFixture]),
    getState: vi.fn(async () => ({ review: null, promptEligible: true })),
    upsert: vi.fn(async () => customerReviewFixture),
    remove: vi.fn(async () => undefined),
    getAdminDashboard: vi.fn(async () => customerReviewAdminDashboard),
    updateModeration: vi.fn(async () => customerReviewAdminDashboard),
    setLineup: vi.fn(async () => customerReviewAdminDashboard),
  };
}

export function createAuthVerifier(): AuthVerifier {
  return {
    verify: vi.fn(async (_env, token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return { id: "user-1", email: "person@example.com", role: "authenticated" };
    }),
  };
}

export function createTenantResolver(): TenantResolver {
  return {
    resolve: vi.fn(async () => ({
      tenantId: TENANT_ID,
      defaultAccountId: `${TENANT_ID}:account:default`,
    })),
  };
}

export function createAccountDeletionService(): AccountDeletionService {
  return {
    deleteAccount: vi.fn(async () => "deleted" as const),
    reconcile: vi.fn(async () => 0),
    reconcileUser: vi.fn(async () => "deleted" as const),
  };
}

export function createAllowedRateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

export function createAllowedBillingRepository(): BillingRepository {
  return {
    getSummary: vi.fn(async () => ({
      plan: "zoption_pro" as const,
      entitlementSource: "paypal" as const,
      provider: "paypal" as const,
      status: "active" as const,
      interval: "month" as const,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      cancelAtPeriodEnd: false,
      pendingCheckout: null,
      canCheckout: false,
      canManageBilling: true,
      canManageSponsoredSeats: false,
      nonTerminalSubscriptionCount: 1,
      usages: [],
      allowances: [{ resource: "custom_category" as const, used: 0, limit: null }],
    })),
    requirePro: vi.fn(async () => undefined),
    createCheckoutReference: vi.fn(async () => ({
      reference: "reference",
      provider: "paypal" as const,
      interval: "month" as const,
      providerPlanId: "P-test",
      providerSubscriptionId: null,
      providerCheckoutId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-01T00:15:00.000Z",
    })),
    createMonthlyImportUsageStatement: vi.fn(() => ({}) as D1PreparedStatement),
    rethrowMonthlyImportUsageError: vi.fn(async (_env, _tenantId, error) => {
      throw error;
    }),
    hasNonTerminalSubscription: vi.fn(async () => false),
    getProviderSubscription: vi.fn(async () => null),
    getPendingCheckout: vi.fn(async () => null),
    listDuePendingCheckouts: vi.fn(async () => []),
    recordCheckoutReconciliation: vi.fn(async () => undefined),
    supersedePendingCheckout: vi.fn(async () => undefined),
    bindCheckoutProviderSubscription: vi.fn(async () => undefined),
    bindCheckoutProviderSession: vi.fn(async () => undefined),
    linkCheckoutSubscription: vi.fn(async () => null),
    applySubscriptionEvent: vi.fn(async () => "applied" as const),
    applySubscriptionSnapshot: vi.fn(async () => "applied" as const),
  };
}

export function createAppWithFakes(options: AppOptions = {}) {
  return createApp({
    readinessCheck: vi.fn().mockResolvedValue(undefined),
    authVerifier: createAuthVerifier(),
    tenantResolver: createTenantResolver(),
    rateLimiter: createAllowedRateLimiter(),
    billing: createAllowedBillingRepository(),
    ...options,
  });
}

export function privateHeaders(additional: Record<string, string> = {}) {
  return { ...AUTHORIZATION, ...additional };
}
