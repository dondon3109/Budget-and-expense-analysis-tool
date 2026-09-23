import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { verifyDodoWebhook } from "../src/billing/dodo";
import { reconcileBillingCheckout } from "../src/billing/reconciliation";
import { billingRepository } from "../src/db/billing";
import { HttpError } from "../src/errors";
import type { RateLimiter } from "../src/rate-limit";
import { createBillingRoutes } from "../src/routes/billing";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { createTestApp } from "./helpers/test-app";

const TENANT_ID = "tenant-1";
const PRODUCT_ID = "pdt_monthly";
const SESSION_ID = "cks_session";
const PAYMENT_ID = "pay_first";
const SUBSCRIPTION_ID = "sub_first";
const SIGNING_KEY = btoa("dodo-test-signing-key");

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

async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(SIGNING_KEY), (character) => character.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

function environment() {
  const { binding, database } = createD1TestDatabase();
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
  const env: Bindings = {
    DB: binding,
    WEB_APP_URL: "https://app.zoption.test",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    DODO_PAYMENTS_API_KEY: "dodo-api-key",
    DODO_PAYMENTS_WEBHOOK_KEY: `whsec_${SIGNING_KEY}`,
    DODO_PRO_MONTHLY_PRODUCT_ID: PRODUCT_ID,
    DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_annual",
  };
  return {
    env,
    checkoutRow: () =>
      database
        .prepare(
          `SELECT provider_subscription_id AS subscriptionId, completed_at AS completedAt,
                  superseded_at AS supersededAt
           FROM billing_checkout_references WHERE provider = 'dodo'`,
        )
        .get() as Record<string, string | null>,
  };
}

/** Answers Dodo API reads the way a paid checkout session reports them. */
function stubDodo(
  options: { paymentId?: string | null; status?: string; nextBillingDate?: string } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === `/checkouts/${SESSION_ID}`) {
      return Response.json({
        id: SESSION_ID,
        payment_id: options.paymentId === undefined ? PAYMENT_ID : options.paymentId,
      });
    }
    if (path === `/payments/${PAYMENT_ID}`) {
      return Response.json({
        payment_id: PAYMENT_ID,
        status: "succeeded",
        subscription_id: SUBSCRIPTION_ID,
        checkout_session_id: SESSION_ID,
      });
    }
    if (path === `/subscriptions/${SUBSCRIPTION_ID}`) {
      return Response.json({
        subscription_id: SUBSCRIPTION_ID,
        status: options.status ?? "active",
        product_id: PRODUCT_ID,
        customer: { customer_id: "cus_1" },
        metadata: {},
        next_billing_date: options.nextBillingDate ?? "2099-01-01T00:00:00Z",
        cancel_at_next_billing_date: false,
      });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openDodoCheckout(env: Bindings) {
  const checkout = await billingRepository.createCheckoutReference(env, TENANT_ID, "month", "dodo");
  await billingRepository.bindCheckoutProviderSession(
    env,
    TENANT_ID,
    checkout.reference,
    "dodo",
    SESSION_ID,
  );
  return checkout;
}

async function deliver(env: Bindings, id: string, event: unknown) {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const app = createApp({
    rateLimiter: allowedRateLimiter(),
    readinessCheck: vi.fn(async () => undefined),
  });
  return app.request(
    "/api/billing/dodo/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": await sign(id, timestamp, body),
      },
      body,
    },
    env,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Dodo Payments webhook signatures", () => {
  it("accepts only a fresh Standard Webhooks signature over the exact body", async () => {
    const { env } = environment();
    const now = Date.parse("2026-08-01T00:00:00.000Z");
    const timestamp = String(now / 1_000);
    const body = '{"type":"subscription.active"}';
    const signature = await sign("msg_1", timestamp, body);
    const headers = { id: "msg_1", timestamp, signature };

    await expect(verifyDodoWebhook(env, body, headers, now)).resolves.toBe(true);
    await expect(
      verifyDodoWebhook(env, body, { ...headers, signature: `v1,bogus ${signature}` }, now),
    ).resolves.toBe(true);
    await expect(verifyDodoWebhook(env, `${body} `, headers, now)).resolves.toBe(false);
    await expect(verifyDodoWebhook(env, body, headers, now + 6 * 60_000)).resolves.toBe(false);
    await expect(
      verifyDodoWebhook(env, body, { ...headers, signature: signature.replace("v1,", "v2,") }, now),
    ).resolves.toBe(false);
  });

  it("rejects an unsigned delivery before reading provider state", async () => {
    const { env } = environment();
    const fetchMock = stubDodo();
    const app = createApp({
      rateLimiter: allowedRateLimiter(),
      readinessCheck: vi.fn(async () => undefined),
    });

    const response = await app.request(
      "/api/billing/dodo/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "webhook-id": "msg_forged",
          "webhook-timestamp": String(Math.floor(Date.now() / 1_000)),
          "webhook-signature": "v1,Zm9yZ2Vk",
        },
        body: JSON.stringify({ type: "payment.succeeded", data: {} }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Dodo Payments subscriptions", () => {
  it("opens a hosted checkout session tagged with the checkout reference", async () => {
    const { env, checkoutRow } = environment();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        session_id: SESSION_ID,
        checkout_url: "https://test.checkout.dodopayments.com/session/cks_session",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = createTestApp({ tenant: { tenantId: TENANT_ID } as never, env });
    app.route("/billing", createBillingRoutes(billingRepository));
    app.onError((error, context) =>
      context.json({}, error instanceof HttpError ? error.status : 500),
    );

    const response = await app.request("/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: "month", provider: "dodo" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      approvalUrl: "https://test.checkout.dodopayments.com/session/cks_session",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://test.dodopayments.com/checkouts");
    const request = JSON.parse(String(init?.body)) as {
      product_cart: unknown;
      metadata: { checkout_reference: string };
      return_url: string;
    };
    expect(request.product_cart).toEqual([{ product_id: PRODUCT_ID, quantity: 1 }]);
    expect(request.return_url).toBe("https://app.zoption.test/app/settings?checkout=completed");
    expect(checkoutRow()).toMatchObject({ subscriptionId: null, completedAt: null });
    expect((await billingRepository.getSummary(env, TENANT_ID)).pendingCheckout).toMatchObject({
      provider: "dodo",
    });

    await expect(
      app.request("/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "month", provider: "dodo" }),
      }),
    ).resolves.toHaveProperty("status", 409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("grants Pro once a paid checkout session's payment names its subscription", async () => {
    const { env, checkoutRow } = environment();
    stubDodo();
    await openDodoCheckout(env);

    const event = {
      business_id: "bus_1",
      type: "payment.succeeded",
      timestamp: "2026-08-01T00:00:00Z",
      data: {
        payload_type: "Payment",
        payment_id: PAYMENT_ID,
        subscription_id: SUBSCRIPTION_ID,
        checkout_session_id: SESSION_ID,
      },
    };
    expect((await deliver(env, "msg_paid", event)).status).toBe(200);
    expect((await deliver(env, "msg_paid", event)).status).toBe(200);

    const summary = await billingRepository.getSummary(env, TENANT_ID);
    expect(summary).toMatchObject({
      plan: "zoption_pro",
      entitlementSource: "dodo",
      provider: "dodo",
      status: "active",
      interval: "month",
      pendingCheckout: null,
      canCheckout: false,
    });
    expect(checkoutRow()).toMatchObject({ subscriptionId: SUBSCRIPTION_ID });
    expect(checkoutRow().completedAt).not.toBeNull();
  });

  it("revokes Pro on a full refund and keeps it on a partial one", async () => {
    const { env } = environment();
    stubDodo();
    await openDodoCheckout(env);
    await reconcileBillingCheckout(billingRepository, env, TENANT_ID);

    const refund = (isPartial: boolean) => ({
      type: "refund.succeeded",
      data: { payload_type: "Refund", payment_id: PAYMENT_ID, is_partial: isPartial },
    });
    expect((await deliver(env, "msg_partial", refund(true))).status).toBe(200);
    expect((await billingRepository.getSummary(env, TENANT_ID)).plan).toBe("zoption_pro");

    expect((await deliver(env, "msg_refund", refund(false))).status).toBe(200);
    const summary = await billingRepository.getSummary(env, TENANT_ID);
    expect(summary).toMatchObject({ plan: "free", status: "canceled", canCheckout: true });
  });

  it("closes an abandoned session but still honors a payment that arrives later", async () => {
    const { env, checkoutRow } = environment();
    stubDodo({ paymentId: null });
    await openDodoCheckout(env);

    const closed = await reconcileBillingCheckout(billingRepository, env, TENANT_ID, {
      abortPendingCheckout: true,
    });
    expect(closed.outcome).toBe("closed");
    expect(checkoutRow().supersededAt).not.toBeNull();

    stubDodo();
    const response = await deliver(env, "msg_late", {
      type: "subscription.active",
      data: {
        payload_type: "Subscription",
        subscription_id: SUBSCRIPTION_ID,
        checkout_session_id: SESSION_ID,
      },
    });

    expect(response.status).toBe(200);
    expect(await billingRepository.getSummary(env, TENANT_ID)).toMatchObject({
      plan: "zoption_pro",
      entitlementSource: "dodo",
    });
  });

  it("asks Dodo to retry a subscription it cannot match to any checkout", async () => {
    const { env } = environment();
    stubDodo();

    const response = await deliver(env, "msg_unknown", {
      type: "subscription.active",
      data: { payload_type: "Subscription", subscription_id: SUBSCRIPTION_ID },
    });

    expect(response.status).toBe(503);
    expect((await billingRepository.getSummary(env, TENANT_ID)).plan).toBe("free");
  });
});
