import type { BillingSummary } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { BillingRepository } from "../src/db/billing";
import type { Bindings } from "../src/types";

const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const TENANT_ID = "user:user-1";

function environment(): Bindings {
  return {
    DB: {} as D1Database,
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_PRO_MONTHLY_PLAN_ID: "P-monthly",
    PAYPAL_PRO_ANNUAL_PLAN_ID: "P-annual",
  };
}

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: "free",
    entitlementSource: null,
    provider: null,
    status: null,
    interval: null,
    currentPeriodEndsAt: null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: {
      provider: "paypal",
      interval: "month",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    canCheckout: false,
    canManageBilling: false,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 0,
    usages: [],
    allowances: [],
    ...overrides,
  };
}

function repository(summaryValue = summary()): BillingRepository {
  return {
    getSummary: vi.fn(async () => summaryValue),
    requirePro: vi.fn(async () => undefined),
    createCheckoutReference: vi.fn(),
    createUsageStatement: vi.fn(() => ({}) as D1PreparedStatement),
    consumeUsage: vi.fn(async () => undefined),
    rethrowUsageError: vi.fn(async (_env, _tenantId, _feature, error) => {
      throw error;
    }),
    hasNonTerminalSubscription: vi.fn(async () => false),
    getPortalCustomer: vi.fn(async () => null),
    getProviderSubscription: vi.fn(async () => null),
    getPendingCheckout: vi.fn(async () => ({
      reference: "checkout-reference",
      provider: "paypal" as const,
      interval: "month" as const,
      providerPlanId: "P-monthly",
      providerSubscriptionId: "I-subscription",
      createdAt: "2026-08-01T00:00:00.000Z",
    })),
    supersedePendingCheckout: vi.fn(async () => undefined),
    bindCheckoutProviderSubscription: vi.fn(async () => undefined),
    applySubscriptionEvent: vi.fn(async () => undefined),
    applySubscriptionSnapshot: vi.fn(async () => undefined),
  };
}

function app(billing: BillingRepository) {
  return createApp({
    billing,
    readinessCheck: vi.fn(async () => undefined),
    authVerifier: {
      verify: vi.fn(async () => ({
        id: "user-1",
        email: "person@example.com",
        role: "authenticated",
      })),
    },
    tenantResolver: {
      resolve: vi.fn(async () => ({
        tenantId: TENANT_ID,
        defaultAccountId: `${TENANT_ID}:account:default`,
      })),
    },
    rateLimiter: {
      consume: vi.fn(async () => ({
        allowed: true,
        limit: 60,
        remaining: 59,
        retryAfterSeconds: 60,
      })),
    },
  });
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
}

function subscriptionResponse(status: string) {
  return new Response(
    JSON.stringify({
      id: "I-subscription",
      status,
      status_update_time: "2026-08-01T00:00:00.000Z",
      plan_id: "P-monthly",
      custom_id: "checkout-reference",
      subscriber: { payer_id: "payer-id" },
      billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
    }),
    { status: 200 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("billing checkout reconciliation", () => {
  it("keeps provider-pending checkout state without granting entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse("APPROVAL_PENDING")),
    );
    const billing = repository();

    const response = await app(billing).request(
      "/api/app/billing/reconcile",
      {
        method: "POST",
        headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
        body: "{}",
      },
      environment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: "pending" });
    expect(billing.applySubscriptionSnapshot).not.toHaveBeenCalled();
    expect(billing.supersedePendingCheckout).not.toHaveBeenCalled();
  });

  it("confirms active access from the canonical PayPal subscription", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse("ACTIVE")),
    );
    const activeSummary = summary({
      plan: "zoption_pro",
      entitlementSource: "paypal",
      provider: "paypal",
      status: "active",
      interval: "month",
      currentPeriodEndsAt: "2099-09-01T00:00:00.000Z",
      pendingCheckout: null,
      canManageBilling: true,
      nonTerminalSubscriptionCount: 1,
    });
    const billing = repository(activeSummary);

    const response = await app(billing).request(
      "/api/app/billing/reconcile",
      {
        method: "POST",
        headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
        body: "{}",
      },
      environment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "confirmed",
      summary: { plan: "zoption_pro" },
    });
    expect(billing.applySubscriptionSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "paypal",
        providerSubscriptionId: "I-subscription",
        providerPlanId: "P-monthly",
        checkoutReference: "checkout-reference",
        status: "active",
        currentPeriodEndsAt: "2099-09-01T00:00:00.000Z",
      }),
    );
  });

  it("closes a provider-terminal checkout and allows recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse("CANCELLED")),
    );
    const billing = repository(summary({ pendingCheckout: null, canCheckout: true }));

    const response = await app(billing).request(
      "/api/app/billing/reconcile",
      {
        method: "POST",
        headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
        body: "{}",
      },
      environment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: "closed" });
    expect(billing.applySubscriptionSnapshot).not.toHaveBeenCalled();
    expect(billing.supersedePendingCheckout).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      "checkout-reference",
    );
  });
});
