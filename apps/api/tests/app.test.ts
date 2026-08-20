import {
  type AccountBalanceUpdate,
  type AccountInterestUpdate,
  type AccountRecord,
  type AccountUpdateWithInterest,
  type AssistantTurnResult,
  type BudgetMonthPlan,
  type CalendarEventMonth,
  type CalendarEventRecord,
  type CategoryRecord,
  type CustomerReview,
  type CustomerReviewAdminDashboard,
  type PublicCustomerReview,
  type DashboardSummary,
  type Debt,
  type FinancialGoal,
  type ImportPreviewRequest,
  type SubscriptionMonthSummary,
  type SubscriptionRecord,
  type TransactionCalendarMonth,
  type TransactionListItem,
  type TransactionPage,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { AccountDeletionService } from "../src/account-deletion";
import type { AssistantService, AssistantTurnExecution } from "../src/assistant/service";
import type { AssistantVoiceService } from "../src/assistant/voice-service";
import type { ReceiptService } from "../src/receipts/service";
import { createApp, type AppOptions } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import type { AccountRepository } from "../src/db/accounts";
import type { BillingRepository } from "../src/db/billing";
import type { BudgetRepository } from "../src/db/budgets";
import type { CategoryRepository } from "../src/db/categories";
import type { CustomerReviewRepository } from "../src/db/customer-reviews";
import type { DebtRepository } from "../src/db/debts";
import type { CalendarEventRepository } from "../src/db/events";
import type { FinancialGoalRepository } from "../src/db/goals";
import type { ImportRepository } from "../src/db/imports";
import type { SubscriptionRepository } from "../src/db/subscriptions";
import type { TenantResolver } from "../src/db/tenants";
import type { TransactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";
import type { PlatformAdminService } from "../src/platform-admin";
import type { Bindings } from "../src/types";

const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const TENANT_ID = "user:user-1";
const customerReviewFixture: CustomerReview = {
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
const publicCustomerReviewFixture: PublicCustomerReview = {
  id: customerReviewFixture.id,
  displayName: customerReviewFixture.displayName,
  rating: customerReviewFixture.rating,
  review: customerReviewFixture.review,
  featuredOrder: 1,
  updatedAt: customerReviewFixture.updatedAt,
};
const customerReviewAdminDashboard: CustomerReviewAdminDashboard = {
  items: [customerReviewFixture],
  lineup: [],
  summary: { total: 1, pending: 1, published: 0, hidden: 0, featured: 0 },
  page: 1,
  pageSize: 50,
  totalFiltered: 1,
  totalPages: 1,
};

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

const cashflowTrendFixture = {
  view: "sixMonth" as const,
  granularity: "month" as const,
  range: { from: "2026-02-01", to: "2026-07-31" },
  points: [{ date: "2026-07-01", incomeMinor: 80_000_00, expenseMinor: 24_550 }],
};

const dashboardFixture: DashboardSummary = {
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

const transactionPage: TransactionPage = {
  items: [transactionItem],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
};

const transactionCalendar: TransactionCalendarMonth = {
  month: "2026-07-01",
  currency: "PHP",
  items: [transactionItem],
  hasAnyTransactions: true,
};

const calendarEventItem: CalendarEventRecord = {
  id: "event-1",
  title: "Dentist",
  date: "2026-07-22",
  startTime: "09:30",
  endTime: "10:15",
  notes: "Bring insurance card",
};

const calendarEventMonth: CalendarEventMonth = {
  month: "2026-07-01",
  items: [calendarEventItem],
};

const categoryItem: CategoryRecord = {
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

const accountItem: AccountRecord = {
  id: "account-everyday",
  name: "Everyday account",
  type: "checking",
  currency: "PHP",
  balanceMinor: null,
  balanceAsOf: null,
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
  accountId: "account-bank",
  accountName: "Bank",
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
    calendar: vi.fn(async () => transactionCalendar),
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
    update: vi.fn(async () => subscriptionItem),
    setStatus: vi.fn(async () => ({ ...subscriptionItem, status: "canceled" as const })),
    remove: vi.fn(async () => undefined),
  };
}

function createCalendarEventStore(): CalendarEventRepository {
  return {
    list: vi.fn(async () => calendarEventMonth),
    create: vi.fn(async () => calendarEventItem),
    update: vi.fn(async () => calendarEventItem),
    remove: vi.fn(async () => undefined),
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

function createCustomerReviewStore(): CustomerReviewRepository {
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

function createAccountDeletionService(): AccountDeletionService {
  return {
    deleteAccount: vi.fn(async () => "deleted" as const),
    reconcile: vi.fn(async () => 0),
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

function createAllowedBillingRepository(): BillingRepository {
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
    applySubscriptionEvent: vi.fn(async () => "applied" as const),
    applySubscriptionSnapshot: vi.fn(async () => "applied" as const),
  };
}

function createTestApp(options: AppOptions = {}) {
  return createApp({
    readinessCheck: vi.fn().mockResolvedValue(undefined),
    authVerifier: createAuthVerifier(),
    tenantResolver: createTenantResolver(),
    rateLimiter: createAllowedRateLimiter(),
    billing: createAllowedBillingRepository(),
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

  it("lists only repository-approved public customer reviews without authentication", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createTestApp({ customerReviews });
    const response = await app.request("/api/reviews");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(response.json()).resolves.toEqual({
      items: [publicCustomerReviewFixture],
    });
    expect(customerReviews.listPublic).toHaveBeenCalledWith(undefined, 6);
  });

  it("protects review moderation with platform-admin authorization", async () => {
    const customerReviews = createCustomerReviewStore();
    const requireAdmin = vi.fn().mockResolvedValue(undefined);
    const app = createTestApp({
      customerReviews,
      platformAdminService: { requireAdmin } as unknown as PlatformAdminService,
    });
    const response = await app.request("/api/app/admin/reviews", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledWith(undefined, "user-1");
    expect(customerReviews.getAdminDashboard).toHaveBeenCalledWith(undefined, {
      page: 1,
      pageSize: 50,
    });
  });

  it("lets a platform admin publish reviews and set a distinct six-item lineup", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createTestApp({
      customerReviews,
      platformAdminService: {
        requireAdmin: vi.fn().mockResolvedValue(undefined),
      } as unknown as PlatformAdminService,
    });
    const publishResponse = await app.request(
      `/api/app/admin/reviews/${customerReviewFixture.id}`,
      {
        method: "PATCH",
        headers: privateHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "published" }),
      },
    );
    const lineupResponse = await app.request("/api/app/admin/reviews/lineup", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reviewIds: [customerReviewFixture.id] }),
    });

    expect(publishResponse.status).toBe(200);
    expect(lineupResponse.status).toBe(200);
    expect(customerReviews.updateModeration).toHaveBeenCalledWith(
      undefined,
      customerReviewFixture.id,
      "published",
    );
    expect(customerReviews.setLineup).toHaveBeenCalledWith(undefined, [customerReviewFixture.id]);
  });

  it("lets an authenticated customer publish one validated review for their tenant", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createTestApp({ customerReviews });
    const response = await app.request("/api/app/reviews/me", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        displayName: "Don",
        rating: 5,
        review: "Zoption gives me a much clearer view of my monthly spending.",
        publishConsent: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(customerReviews.upsert).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "user-1",
      expect.objectContaining({ rating: 5, publishConsent: true }),
    );
  });

  it("rejects a customer review without explicit public consent", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createTestApp({ customerReviews });
    const response = await app.request("/api/app/reviews/me", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        displayName: "Don",
        rating: 5,
        review: "Zoption gives me a much clearer view of my monthly spending.",
        publishConsent: false,
      }),
    });

    expect(response.status).toBe(400);
    expect(customerReviews.upsert).not.toHaveBeenCalled();
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
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "person@example.com",
        role: "authenticated",
      },
      tenantId: TENANT_ID,
    });
  });

  it("accepts bounded multipart recordings on the authenticated voice route", async () => {
    const transcribe = vi.fn(async () => ({
      text: "Review this transcript",
      durationSeconds: 2,
      languageCode: "en",
    }));
    const assistantVoiceService = { transcribe } as unknown as AssistantVoiceService;
    const app = createTestApp({ assistantVoiceService });
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }));

    const response = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: "Review this transcript" });
    expect(transcribe).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File));
  });

  it("rejects JSON on the multipart voice transcription route", async () => {
    const transcribe = vi.fn();
    const assistantVoiceService = { transcribe } as unknown as AssistantVoiceService;
    const app = createTestApp({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ audio: "not-a-recording" }),
    });

    expect(response.status).toBe(415);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns spoken audio with the authenticated Preview origin headers", async () => {
    const synthesize = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const assistantVoiceService = { synthesize } as unknown as AssistantVoiceService;
    const app = createTestApp({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/speech", {
      method: "POST",
      headers: privateHeaders({
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      }),
      body: JSON.stringify({
        messageId: "00000000-0000-4000-8000-000000000003",
        voice: "bright",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(synthesize).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "00000000-0000-4000-8000-000000000003",
      "bright",
    );
  });

  it("returns an authenticated curated voice preview", async () => {
    const preview = vi.fn(async () => new Response(new Uint8Array([4, 5, 6])));
    const assistantVoiceService = { preview } as unknown as AssistantVoiceService;
    const app = createTestApp({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ voice: "energetic" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
    expect(preview).toHaveBeenCalledWith(undefined, "energetic");
  });

  it("returns authenticated receipt preferences", async () => {
    const receiptService = {
      getPreferences: vi.fn(async () => ({
        enabled: true,
        consentedAt: null,
        consentVersion: 0,
        visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
      })),
    } as unknown as ReceiptService;
    const app = createTestApp({ receiptService });
    const response = await app.request("/api/app/receipts/preferences", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: true, consentVersion: 0 });
    expect(receiptService.getPreferences).toHaveBeenCalledWith(undefined, TENANT_ID);
  });

  it("rejects an invalid receipt consent update", async () => {
    const grantConsent = vi.fn();
    const receiptService = { grantConsent } as unknown as ReceiptService;
    const app = createTestApp({ receiptService });
    const response = await app.request("/api/app/receipts/preferences", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ consented: false }),
    });

    expect(response.status).toBe(400);
    expect(grantConsent).not.toHaveBeenCalled();
  });

  it("accepts a bounded multipart photo on the authenticated receipt route", async () => {
    const extract = vi.fn(async () => ({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: -28500,
      currency: "PHP",
      kind: "expense",
      categoryName: "Food & dining",
      rawText: "JOLLIBEE 285.00",
    }));
    const receiptService = { extract } as unknown as ReceiptService;
    const app = createTestApp({ receiptService });
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));

    const response = await app.request("/api/app/receipts/extract", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      merchant: "Jollibee",
      amountMinor: -28500,
    });
    expect(extract).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File));
  });

  it("rejects JSON on the multipart receipt extraction route", async () => {
    const extract = vi.fn();
    const receiptService = { extract } as unknown as ReceiptService;
    const app = createTestApp({ receiptService });
    const response = await app.request("/api/app/receipts/extract", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: "not-a-photo" }),
    });

    expect(response.status).toBe(415);
    expect(extract).not.toHaveBeenCalled();
  });

  it.each([
    ["new thread", "/api/app/assistant/threads", 201],
    [
      "existing thread",
      "/api/app/assistant/threads/00000000-0000-4000-8000-000000000001/messages",
      200,
    ],
  ])(
    "forwards Cloudflare waitUntil for an assistant turn in a %s",
    async (_label, path, status) => {
      const result: AssistantTurnResult = {
        thread: {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Assistant test",
          lastMessageAt: "2026-08-10T00:00:01.000Z",
          createdAt: "2026-08-10T00:00:00.000Z",
        },
        userMessage: {
          id: "00000000-0000-4000-8000-000000000002",
          threadId: "00000000-0000-4000-8000-000000000001",
          role: "user",
          content: "Test message",
          status: "completed",
          createdAt: "2026-08-10T00:00:00.000Z",
        },
        assistantMessage: {
          id: "00000000-0000-4000-8000-000000000003",
          threadId: "00000000-0000-4000-8000-000000000001",
          role: "assistant",
          content: "Test answer",
          status: "completed",
          createdAt: "2026-08-10T00:00:01.000Z",
        },
      };
      const completeTurn = vi.fn(async (...args: unknown[]) => {
        const execution = args.at(-1) as AssistantTurnExecution | undefined;
        execution?.defer(Promise.resolve());
        return result;
      });
      const assistantService = {
        createThreadTurn: completeTurn,
        sendTurn: completeTurn,
      } as unknown as AssistantService;
      const app = createTestApp({ assistantService });
      const waitUntil = vi.fn(() => undefined);
      const executionContext = { waitUntil } as unknown as ExecutionContext;

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: "Test message",
            clientRequestId: "00000000-0000-4000-8000-000000000004",
          }),
        },
        { DB: {} as D1Database, ASSISTANT_ENABLED: "true" },
        executionContext,
      );

      expect(response.status).toBe(status);
      expect(completeTurn).toHaveBeenCalledOnce();
      expect(waitUntil).toHaveBeenCalledOnce();
      expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    },
  );

  it("deletes only the authenticated account without resolving or bootstrapping a tenant", async () => {
    const tenantResolver = createTenantResolver();
    const accountDeletionService = createAccountDeletionService();
    const app = createTestApp({ tenantResolver, accountDeletionService });

    const response = await app.request("/api/app/account", {
      method: "DELETE",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ confirmation: "DELETE", password: "current-password" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted" });
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
    expect(accountDeletionService.deleteAccount).toHaveBeenCalledWith({
      env: undefined,
      user: { id: "user-1", email: "person@example.com", role: "authenticated" },
      accessToken: "valid-token",
      password: "current-password",
    });
  });

  it("validates deletion confirmation before invoking the deletion service", async () => {
    const accountDeletionService = createAccountDeletionService();
    const app = createTestApp({ accountDeletionService });
    const response = await app.request("/api/app/account", {
      method: "DELETE",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ confirmation: "delete", password: "current-password" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
    expect(accountDeletionService.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a JSON media type before parsing write requests", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: JSON.stringify({
        date: "2026-07-18",
        description: "Groceries",
        amountMinor: 2_455,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
        accountId: "account-everyday",
      }),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ error: "unsupported_media_type" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before reaching the route repository", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({
        "Content-Type": "application/json",
        "Content-Length": String(65 * 1024),
      }),
      body: "{}",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with a stable client error", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("adds HSTS to HTTPS API responses", async () => {
    const app = createTestApp();
    const response = await app.request("https://api.zoption.site/api/app/me", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
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

  it("loads Expense Breakdown for a Free tenant without requiring Pro", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const requirePro = vi.fn(async () => undefined);
    const billing: BillingRepository = {
      ...createAllowedBillingRepository(),
      getSummary: vi.fn(async () => ({
        plan: "free" as const,
        entitlementSource: null,
        provider: null,
        status: null,
        interval: null,
        currentPeriodEndsAt: null,
        scheduledChangeAt: null,
        cancelAtPeriodEnd: false,
        pendingCheckout: null,
        canCheckout: true,
        canManageBilling: false,
        canManageSponsoredSeats: false,
        nonTerminalSubscriptionCount: 0,
        usages: [],
        allowances: [{ resource: "custom_category" as const, used: 0, limit: 1 }],
      })),
      requirePro,
    };
    const app = createTestApp({ billing, dashboardLoader: loader });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      spendingByCategory: dashboardFixture.spendingByCategory,
    });
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(requirePro).not.toHaveBeenCalled();
  });

  it("loads a validated cashflow view for the resolved tenant", async () => {
    const loader = vi.fn().mockResolvedValue(cashflowTrendFixture);
    const app = createTestApp({ cashflowTrendLoader: loader });
    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      view: "weekly",
      anchorDate: "2026-07-27",
    });
  });

  it("rejects invalid cashflow trend queries", async () => {
    const loader = vi.fn().mockResolvedValue(cashflowTrendFixture);
    const app = createTestApp({ cashflowTrendLoader: loader });
    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=yearly&anchorDate=2026-07-32",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(400);
    expect(loader).not.toHaveBeenCalled();
  });

  it("loads the transfer fee insight for the resolved tenant with a reference date", async () => {
    const insight = {
      hasFees: true,
      totalTransfers: 3,
      totalFeeChargedTransfers: 2,
      feesByCurrency: { PHP: 250, USD: 0 },
      weekly: [],
      recentWeekCount: 0,
      recentAverageTransfersPerWeek: 0,
      recentAverageFeeChargedTransfersPerWeek: 0,
    };
    const loader = vi.fn().mockResolvedValue(insight);
    const app = createTestApp({ transferFeeLoader: loader });
    const response = await app.request("/api/app/dashboard/transfer-fees", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]?.[1]).toBe(TENANT_ID);
    expect(loader.mock.calls[0]?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(response.json()).resolves.toEqual(insight);
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

  it("loads a complete calendar month for the resolved tenant", async () => {
    const transactions = createTransactionStore();
    const app = createTestApp({ transactions });
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
    const app = createTestApp({ transactions });
    const response = await app.request("/api/app/transactions/calendar?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(400);
    expect(transactions.calendar).not.toHaveBeenCalled();
  });

  it("lists accounts for the resolved tenant", async () => {
    const accounts = createAccountStore();
    const app = createTestApp({ accounts });
    const response = await app.request("/api/app/accounts", { headers: AUTHORIZATION });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [accountItem] });
    expect(accounts.list).toHaveBeenCalledWith(undefined, TENANT_ID);
  });

  it("updates an account type and interest settings atomically", async () => {
    const accounts = createAccountStore();
    const app = createTestApp({ accounts });
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
    const app = createTestApp({ accounts });
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
    const app = createTestApp({ accounts });
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
        requested: "account_management",
        requiredPlan: "zoption_pro",
      }),
    );
    const billing: BillingRepository = {
      ...createAllowedBillingRepository(),
      requirePro,
    };
    const app = createTestApp({ accounts, billing });
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

  it("rate-limits authenticated tenant reads by default", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 120,
        remaining: 0,
        retryAfterSeconds: 24,
      })),
    };
    const app = createTestApp({ dashboardLoader: loader, rateLimiter });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(429);
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-read",
      limit: 120,
      windowSeconds: 60,
    });
    expect(loader).not.toHaveBeenCalled();
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

  it("rate-limits bulk export reads before querying transactions", async () => {
    const transactions = createTransactionStore();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 20,
        remaining: 0,
        retryAfterSeconds: 18,
      })),
    };
    const app = createTestApp({ transactions, rateLimiter });
    const response = await app.request("/api/app/exports/transactions.csv", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(429);
    expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-export-read",
      limit: 20,
      windowSeconds: 60,
    });
    expect(transactions.export).not.toHaveBeenCalled();
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
        accountId: "account-bank",
      }),
    });
    expect(createResponse.status).toBe(201);
    expect(subscriptions.create).toHaveBeenCalledWith(undefined, TENANT_ID, {
      name: "Music streaming",
      amountMinor: 199_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "food",
      accountId: "account-bank",
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

    const updateResponse = await app.request("/api/app/subscriptions/subscription-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Music streaming Plus",
        amountMinor: 249_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "food",
        accountId: "account-bank",
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(subscriptions.update).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1", {
      name: "Music streaming Plus",
      amountMinor: 249_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "food",
      accountId: "account-bank",
    });

    const deleteResponse = await app.request("/api/app/subscriptions/subscription-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(subscriptions.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1");
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

  it("lists, creates, updates, and deletes events for the resolved tenant", async () => {
    const events = createCalendarEventStore();
    const app = createTestApp({ events });

    const listResponse = await app.request("/api/app/events?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(200);
    expect(events.list).toHaveBeenCalledWith(undefined, TENANT_ID, { month: "2026-07-01" });

    const input = {
      title: "Dentist",
      date: "2026-07-22",
      startTime: "09:30",
      endTime: "10:15",
      notes: "Bring insurance card",
    };
    const createResponse = await app.request("/api/app/events", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    expect(createResponse.status).toBe(201);
    expect(events.create).toHaveBeenCalledWith(undefined, TENANT_ID, input);

    const updateResponse = await app.request("/api/app/events/event-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "Dental appointment" }),
    });
    expect(updateResponse.status).toBe(200);
    expect(events.update).toHaveBeenCalledWith(undefined, TENANT_ID, "event-1", {
      title: "Dental appointment",
    });

    const deleteResponse = await app.request("/api/app/events/event-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(events.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "event-1");
  });

  it("rejects invalid event months and fields before repository access", async () => {
    const events = createCalendarEventStore();
    const app = createTestApp({ events });

    const listResponse = await app.request("/api/app/events?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(400);
    expect(events.list).not.toHaveBeenCalled();

    const createResponse = await app.request("/api/app/events", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        title: "Invalid event",
        date: "2026-07-22",
        endTime: "10:00",
      }),
    });
    expect(createResponse.status).toBe(400);
    expect(events.create).not.toHaveBeenCalled();

    const updateResponse = await app.request("/api/app/events/event-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(updateResponse.status).toBe(400);
    expect(events.update).not.toHaveBeenCalled();
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

  it("supports tenant-scoped financial goal CRUD", async () => {
    const goal: FinancialGoal = {
      id: "goal-1",
      name: "Emergency fund",
      targetAmountMinor: 120_000_00,
      currentAmountMinor: 30_000_00,
      targetDate: "2027-08-01",
      status: "active",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const goals = {
      list: vi.fn(async () => [goal]),
      create: vi.fn(async () => goal),
      update: vi.fn(async () => ({ ...goal, status: "paused" as const })),
      remove: vi.fn(async () => undefined),
    } satisfies FinancialGoalRepository;
    const app = createTestApp({ goals });

    const listResponse = await app.request("/api/app/goals", { headers: AUTHORIZATION });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ items: [goal] });
    expect(goals.list).toHaveBeenCalledWith(undefined, TENANT_ID);

    const createInput = {
      name: goal.name,
      targetAmountMinor: goal.targetAmountMinor,
      currentAmountMinor: goal.currentAmountMinor,
      targetDate: goal.targetDate,
      status: goal.status,
    };
    const createResponse = await app.request("/api/app/goals", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(createInput),
    });
    expect(createResponse.status).toBe(201);
    expect(goals.create).toHaveBeenCalledWith(undefined, TENANT_ID, createInput);

    const updateResponse = await app.request("/api/app/goals/goal-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "paused" }),
    });
    expect(updateResponse.status).toBe(200);
    expect(goals.update).toHaveBeenCalledWith(undefined, TENANT_ID, "goal-1", {
      status: "paused",
    });

    const deleteResponse = await app.request("/api/app/goals/goal-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(goals.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "goal-1");
  });

  it("supports tenant-scoped debt CRUD and rejects invalid inputs", async () => {
    const debt: Debt = {
      id: "debt-1",
      name: "Main card",
      type: "credit_card",
      balanceMinor: 45_000_00,
      aprBasisPoints: 1800,
      minimumPaymentMinor: 2_500_00,
      balanceAsOf: "2026-08-01",
      status: "active",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const debts = {
      list: vi.fn(async () => [debt]),
      create: vi.fn(async () => debt),
      update: vi.fn(async () => ({ ...debt, status: "paid" as const })),
      remove: vi.fn(async () => undefined),
    } satisfies DebtRepository;
    const app = createTestApp({ debts });

    const listResponse = await app.request("/api/app/debts", { headers: AUTHORIZATION });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ items: [debt] });

    const invalidResponse = await app.request("/api/app/debts", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "Incomplete debt" }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(debts.create).not.toHaveBeenCalled();

    const createInput = {
      name: debt.name,
      type: debt.type,
      balanceMinor: debt.balanceMinor,
      aprBasisPoints: debt.aprBasisPoints,
      minimumPaymentMinor: debt.minimumPaymentMinor,
      balanceAsOf: debt.balanceAsOf,
      status: debt.status,
    };
    const createResponse = await app.request("/api/app/debts", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(createInput),
    });
    expect(createResponse.status).toBe(201);
    expect(debts.create).toHaveBeenCalledWith(undefined, TENANT_ID, createInput);

    const updateResponse = await app.request("/api/app/debts/debt-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "paid", balanceMinor: 0 }),
    });
    expect(updateResponse.status).toBe(200);
    expect(debts.update).toHaveBeenCalledWith(undefined, TENANT_ID, "debt-1", {
      status: "paid",
      balanceMinor: 0,
    });

    const deleteResponse = await app.request("/api/app/debts/debt-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(debts.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "debt-1");
  });
});
