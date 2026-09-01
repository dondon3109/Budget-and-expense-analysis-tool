import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { clearPayPalAccessTokenCacheForTesting } from "../src/billing/paypal";
import type { BillingRepository } from "../src/db/billing";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

function environment(): Bindings {
  return {
    DB: {} as D1Database,
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_WEBHOOK_ID: "webhook-id",
  };
}

function repository(outcome: "applied" | "unmatched" = "applied") {
  return {
    applySubscriptionEvent: vi.fn(async () => outcome),
  } as unknown as BillingRepository;
}

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

function payload() {
  return {
    id: "WH-event",
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    create_time: "2026-08-01T00:00:00.000Z",
    resource: { id: "I-subscription" },
  };
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3_600 }), {
    status: 200,
  });
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

async function post(
  billing: BillingRepository,
  body: unknown = payload(),
  requestHeaders: Record<string, string> = headers(),
  rateLimiter: RateLimiter = allowedRateLimiter(),
) {
  const app = createApp({
    billing,
    rateLimiter,
    readinessCheck: vi.fn(async () => undefined),
  });
  return app.request(
    "/api/billing/paypal/webhook",
    { method: "POST", headers: requestHeaders, body: JSON.stringify(body) },
    environment(),
  );
}

afterEach(() => {
  clearPayPalAccessTokenCacheForTesting();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PayPal webhook validation", () => {
  it("does not expose the retired Paddle webhook route", async () => {
    const app = createApp({ billing: repository(), readinessCheck: vi.fn(async () => undefined) });

    const response = await app.request(
      "/api/billing/paddle/webhook",
      { method: "POST" },
      environment(),
    );

    expect(response.status).toBe(404);
  });

  it("rate-limits by Cloudflare client IP before body or provider work", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 37,
      })),
    };
    const app = createApp({
      billing,
      rateLimiter,
      readinessCheck: vi.fn(async () => undefined),
    });

    const response = await app.request(
      "/api/billing/paypal/webhook",
      {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "203.0.113.8",
          "X-Forwarded-For": "198.51.100.10",
          ...headers(),
        },
        body: "{",
      },
      environment(),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(rateLimiter.consume).toHaveBeenCalledWith(environment(), "203.0.113.8", {
      scope: "paypal-webhook",
      limit: 60,
      windowSeconds: 60,
    });
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one fail-closed identity when Cloudflare client IP is absent", async () => {
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 60,
      })),
    };

    await post(repository(), payload(), headers(), rateLimiter);

    expect(rateLimiter.consume).toHaveBeenCalledWith(
      environment(),
      "missing-cf-connecting-ip",
      expect.objectContaining({ scope: "paypal-webhook" }),
    );
  });

  it("rejects an event without required transmission headers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing, payload(), { "Content-Type": "application/json" });

    expect(response.status).toBe(400);
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed transmission headers before parsing the body", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();
    const app = createApp({
      billing,
      rateLimiter: allowedRateLimiter(),
      readinessCheck: vi.fn(async () => undefined),
    });

    const response = await app.request(
      "/api/billing/paypal/webhook",
      {
        method: "POST",
        headers: { ...headers(), "paypal-cert-url": "https://example.com/cert.pem" },
        body: "{",
      },
      environment(),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
  });

  it("applies only a PayPal-verified canonical subscription", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "ACTIVE",
            status_update_time: "2026-08-01T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
            billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.mocked(billing.applySubscriptionEvent)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "paypal",
        providerEventId: "WH-event",
        providerSubscriptionId: "I-subscription",
        providerPlanId: "P-monthly",
        providerCustomerId: "payer-id",
        status: "active",
        checkoutReference: "checkout-reference",
      }),
    );
  });

  it("marks an active canonical subscription past due after a failed payment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "ACTIVE",
            status_update_time: "2026-08-01T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
            billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing, {
      ...payload(),
      event_type: "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(billing.applySubscriptionEvent)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerEventId: "WH-event",
        providerSubscriptionId: "I-subscription",
        providerStatus: "ACTIVE",
        status: "past_due",
      }),
    );
  });

  it("recovers a past-due subscription from a completed canonical sale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "ACTIVE",
            status_update_time: "2026-08-02T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
            billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing, {
      id: "WH-sale-completed",
      event_type: "PAYMENT.SALE.COMPLETED",
      create_time: "2026-08-02T00:00:00.000Z",
      resource: {
        id: "sale-id-is-not-the-subscription-id",
        billing_agreement_id: "I-subscription",
      },
    });

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-subscription",
    );
    expect(vi.mocked(billing.applySubscriptionEvent)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerEventId: "WH-sale-completed",
        type: "PAYMENT.SALE.COMPLETED",
        occurredAt: "2026-08-02T00:00:00.000Z",
        providerSubscriptionId: "I-subscription",
        providerStatus: "ACTIVE",
        status: "active",
      }),
    );
  });

  it("preserves a canonical canceled status when processing a failed payment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "CANCELLED",
            status_update_time: "2026-08-03T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing, {
      ...payload(),
      event_type: "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
      create_time: "2026-08-03T00:00:00.000Z",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(billing.applySubscriptionEvent)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerStatus: "CANCELLED",
        status: "canceled",
        cancelAtPeriodEnd: true,
      }),
    );
  });

  it("returns a retryable response when canonical activation is still pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "APPROVED",
            status_update_time: "2026-08-01T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "billing_provider_pending" });
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
  });

  it("does not acknowledge a canonical subscription that cannot be matched", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "ACTIVE",
            status_update_time: "2026-08-01T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
            billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository("unmatched");

    const response = await post(billing);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "billing_provider_pending" });
  });

  it("rejects failed verification before loading subscription state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing);

    expect(response.status).toBe(400);
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
