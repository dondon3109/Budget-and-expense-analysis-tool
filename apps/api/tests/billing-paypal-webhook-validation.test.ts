import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { BillingRepository } from "../src/db/billing";
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

function payload() {
  return {
    id: "WH-event",
    event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
    create_time: "2026-08-01T00:00:00.000Z",
    resource: { id: "I-subscription" },
  };
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
}

function headers() {
  return {
    "Content-Type": "application/json",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
    "paypal-transmission-id": "transmission-id",
    "paypal-transmission-sig": "signature",
    "paypal-transmission-time": "2026-08-01T00:00:00.000Z",
  };
}

async function post(
  billing: BillingRepository,
  body = payload(),
  requestHeaders: Record<string, string> = headers(),
) {
  const app = createApp({ billing, readinessCheck: vi.fn(async () => undefined) });
  return app.request(
    "/api/billing/paypal/webhook",
    { method: "POST", headers: requestHeaders, body: JSON.stringify(body) },
    environment(),
  );
}

afterEach(() => {
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

  it("rejects an event without required transmission headers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing, payload(), { "Content-Type": "application/json" });

    expect(response.status).toBe(400);
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies only a PayPal-verified canonical subscription", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "ACTIVE",
            status_update_time: "2026-08-01T00:00:00.000Z",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            subscriber: { payer_id: "payer-id" },
            billing_info: { next_billing_time: "2026-09-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing);

    expect(response.status).toBe(200);
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

  it("returns a retryable response when canonical activation is still pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }))
      .mockResolvedValueOnce(tokenResponse())
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }))
      .mockResolvedValueOnce(tokenResponse())
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const billing = repository();

    const response = await post(billing);

    expect(response.status).toBe(400);
    expect(vi.mocked(billing.applySubscriptionEvent)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
