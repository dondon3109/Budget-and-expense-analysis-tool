import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { clearPayPalAccessTokenCacheForTesting } from "../src/billing/paypal";
import { billingRepository, type BillingRepository } from "../src/db/billing";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = "tenant-1";
const SUBSCRIPTION_ID = "I-subscription";
const PLAN_ID = "P-monthly";

function allowedRateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3_600 }), {
    status: 200,
  });
}

function verifiedResponse() {
  return new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 });
}

function headers() {
  return {
    "Content-Type": "application/json",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-example",
    "paypal-transmission-id": "transmission-id",
    "paypal-transmission-sig": "c2lnbmF0dXJlLXNpZ25hdHVyZQ==",
    "paypal-transmission-time": new Date().toISOString(),
  };
}

/** A live Pro subscription row plus the checkout row the capture path resolves through. */
function environment(providerPlanId = PLAN_ID): {
  env: Bindings;
  subscription: () => Record<string, unknown> | undefined;
  entitlement: () => number;
} {
  const { binding, database } = createD1TestDatabase();
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
  database
    .prepare(
      `INSERT INTO billing_subscriptions (
         provider, provider_subscription_id, tenant_id, provider_customer_id, provider_plan_id,
         provider_status, status, interval, current_period_ends_at, cancel_at_period_end,
         last_provider_occurred_at, last_provider_event_id
       ) VALUES ('paypal', ?, ?, 'payer-id', ?, 'ACTIVE', 'active', 'month',
                 '2099-01-01T00:00:00.000Z', 0, '2026-08-01T00:00:00.000Z', 'event-1')`,
    )
    .run(SUBSCRIPTION_ID, TENANT_ID, providerPlanId);
  database
    .prepare(
      `INSERT INTO billing_checkout_references (
         id, tenant_id, provider, plan, interval, provider_plan_id, provider_subscription_id,
         expires_at, completed_at
       ) VALUES ('checkout-ref', ?, 'paypal', 'zoption_pro', 'month', ?, ?, 
                 '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
    )
    .run(TENANT_ID, providerPlanId, SUBSCRIPTION_ID);

  return {
    env: {
      DB: binding,
      PAYPAL_ENVIRONMENT: "sandbox",
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "client-secret",
      PAYPAL_WEBHOOK_ID: "webhook-id",
      PAYPAL_PRO_MONTHLY_PLAN_ID: PLAN_ID,
    },
    subscription: () =>
      database
        .prepare(
          `SELECT status, provider_status AS providerStatus, interval,
                  current_period_ends_at AS currentPeriodEndsAt,
                  cancel_at_period_end AS cancelAtPeriodEnd
           FROM billing_subscriptions WHERE provider_subscription_id = ?`,
        )
        .get(SUBSCRIPTION_ID) as Record<string, unknown> | undefined,
    entitlement: () => {
      const row = database
        .prepare("SELECT COUNT(*) AS count FROM effective_pro_entitlements WHERE tenant_id = ?")
        .get(TENANT_ID) as { count: number } | undefined;
      return Number(row?.count ?? 0);
    },
  };
}

function repository(outcome: "applied" | "unmatched" = "applied") {
  return { applySubscriptionEvent: vi.fn(async () => outcome) } as unknown as BillingRepository;
}

/** `billing` is injected only when a test needs to observe the call; otherwise the real repository runs. */
async function post(env: Bindings, body: unknown, billing?: BillingRepository) {
  const app = createApp({
    ...(billing ? { billing } : {}),
    rateLimiter: allowedRateLimiter(),
    readinessCheck: vi.fn(async () => undefined),
  });
  return app.request(
    "/api/billing/paypal/webhook",
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
    env,
  );
}

afterEach(() => {
  clearPayPalAccessTokenCacheForTesting();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PayPal revocation webhooks", () => {
  it("revokes Pro locally when a subscription payment is refunded", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(verifiedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { env, subscription } = environment();

    const response = await post(env, {
      id: "WH-refund",
      event_type: "PAYMENT.SALE.REFUNDED",
      create_time: "2026-08-02T00:00:00.000Z",
      resource_type: "refund",
      resource: { id: "refund-1", billing_agreement_id: SUBSCRIPTION_ID },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(subscription()).toMatchObject({
      status: "canceled",
      providerStatus: "REFUNDED",
      currentPeriodEndsAt: "2026-08-02T00:00:00.000Z",
      cancelAtPeriodEnd: 0,
    });
    // The revocation is local: PayPal is never asked about the still-active agreement.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves a reversed capture through the checkout reference it echoes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(verifiedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { env, subscription } = environment();

    const response = await post(env, {
      id: "WH-reversal",
      event_type: "PAYMENT.CAPTURE.REVERSED",
      create_time: "2026-08-03T00:00:00.000Z",
      resource_type: "capture",
      resource: { id: "capture-1", custom_id: "checkout-ref" },
    });

    expect(response.status).toBe(200);
    expect(subscription()).toMatchObject({ status: "canceled", providerStatus: "REVERSED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("acknowledges a dispute that names no subscription without revoking anything", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(verifiedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { env, subscription } = environment();

    const response = await post(env, {
      id: "WH-dispute",
      event_type: "CUSTOMER.DISPUTE.CREATED",
      create_time: "2026-08-04T00:00:00.000Z",
      resource_type: "dispute",
      resource: {
        id: "PP-D-1",
        disputed_transactions: [{ seller_transaction_id: "capture-1" }],
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(subscription()).toMatchObject({ status: "active" });
    expect(JSON.stringify(warnSpy.mock.calls)).toContain("not matched to a subscription");
    warnSpy.mockRestore();
  });

  it("records the revocation through the billing repository", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(verifiedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { env } = environment();
    const billing = repository("unmatched");

    const response = await post(env, {
      id: "WH-refund-2",
      event_type: "PAYMENT.SALE.REFUNDED",
      create_time: "2026-08-02T00:00:00.000Z",
      resource: { id: "refund-2", billing_agreement_id: SUBSCRIPTION_ID },
    }, billing);

    expect(response.status).toBe(200);
    expect(vi.mocked(billing.applySubscriptionEvent)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerEventId: "WH-refund-2",
        type: "PAYMENT.SALE.REFUNDED",
        providerSubscriptionId: SUBSCRIPTION_ID,
        providerPlanId: PLAN_ID,
        providerStatus: "REFUNDED",
        status: "canceled",
        cancelAtPeriodEnd: false,
      }),
    );
  });

  it("revokes a subscription whose plan is no longer configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(verifiedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { env, subscription, entitlement } = environment("P-retired");
    expect(entitlement()).toBe(1);

    const response = await post(env, {
      id: "WH-retired-refund",
      event_type: "PAYMENT.SALE.REFUNDED",
      create_time: "2026-08-02T00:00:00.000Z",
      resource_type: "refund",
      resource: { id: "refund-retired", billing_agreement_id: SUBSCRIPTION_ID },
    });

    expect(response.status).toBe(200);
    expect(subscription()).toMatchObject({
      status: "canceled",
      providerStatus: "REFUNDED",
      interval: "month",
    });
    expect(entitlement()).toBe(0);
  });

  it("writes the terminal state through the repository for a plan that is not sellable", async () => {
    const { env, subscription, entitlement } = environment("P-retired");

    const outcome = await billingRepository.applySubscriptionEvent(env, {
      provider: "paypal",
      providerEventId: "WH-retired-revocation",
      type: "PAYMENT.CAPTURE.REVERSED",
      occurredAt: "2026-08-02T00:00:00.000Z",
      providerSubscriptionId: SUBSCRIPTION_ID,
      providerCustomerId: "payer-id",
      providerProductId: null,
      providerPlanId: "P-retired",
      providerStatus: "REVERSED",
      status: "canceled",
      interval: "month",
      currentPeriodEndsAt: "2026-08-02T00:00:00.000Z",
      scheduledChangeAt: null,
      cancelAtPeriodEnd: false,
      checkoutReference: null,
      revocation: true,
    });

    expect(outcome).toBe("applied");
    expect(subscription()).toMatchObject({
      status: "canceled",
      providerStatus: "REVERSED",
      interval: "month",
    });
    expect(entitlement()).toBe(0);
  });

  it("still rejects a normal subscription update whose plan is no longer configured", async () => {
    const { env, subscription } = environment("P-retired");

    const outcome = await billingRepository.applySubscriptionEvent(env, {
      provider: "paypal",
      providerEventId: "WH-retired-update",
      type: "BILLING.SUBSCRIPTION.UPDATED",
      occurredAt: "2026-08-02T00:00:00.000Z",
      providerSubscriptionId: SUBSCRIPTION_ID,
      providerCustomerId: "payer-id",
      providerProductId: null,
      providerPlanId: "P-retired",
      providerStatus: "ACTIVE",
      status: "active",
      interval: null,
      currentPeriodEndsAt: "2099-01-01T00:00:00.000Z",
      scheduledChangeAt: null,
      cancelAtPeriodEnd: false,
      checkoutReference: null,
    });

    expect(outcome).toBe("rejected_plan");
    expect(subscription()).toMatchObject({ status: "active" });
  });
});
