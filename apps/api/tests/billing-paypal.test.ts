import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelPayPalSubscription,
  createPayPalSubscription,
  getPayPalSubscription,
  isPayPalCheckoutPending,
  normalizePayPalSubscriptionStatus,
  verifyPayPalWebhook,
} from "../src/billing/paypal";
import { HttpError } from "../src/errors";
import type { Bindings } from "../src/types";

function bindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as D1Database,
    WEB_APP_URL: "https://app.zoption.test",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_WEBHOOK_ID: "webhook-id",
    ...overrides,
  };
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PayPal subscription gateway", () => {
  it("creates a server-owned sandbox checkout with fixed return URLs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "I-subscription",
            status: "APPROVAL_PENDING",
            plan_id: "P-monthly",
            custom_id: "checkout-reference",
            links: [
              {
                rel: "approve",
                href: "https://www.sandbox.paypal.com/checkoutnow?token=example",
              },
            ],
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPayPalSubscription(bindings(), {
        planId: "P-monthly",
        checkoutReference: "checkout-reference",
      }),
    ).resolves.toMatchObject({
      id: "I-subscription",
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=example",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    const createRequest = fetchMock.mock.calls[1];
    expect(createRequest?.[0]).toBe("https://api-m.sandbox.paypal.com/v1/billing/subscriptions");
    expect(createRequest?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "PayPal-Request-Id": "zoption-checkout-checkout-reference",
      },
      body: JSON.stringify({
        plan_id: "P-monthly",
        custom_id: "checkout-reference",
        application_context: {
          return_url: "https://app.zoption.test/app/settings?checkout=completed#plan-and-billing",
          cancel_url: "https://app.zoption.test/app/settings?checkout=cancelled#plan-and-billing",
          user_action: "SUBSCRIBE_NOW",
        },
      }),
    });
  });

  it("rejects an approval URL outside the configured PayPal host", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "I-subscription",
              status: "APPROVAL_PENDING",
              plan_id: "P-monthly",
              links: [{ rel: "approve", href: "https://example.test/phish" }],
            }),
            { status: 201 },
          ),
        ),
    );

    await expect(
      createPayPalSubscription(bindings(), {
        planId: "P-monthly",
        checkoutReference: "checkout-reference",
      }),
    ).rejects.toEqual(
      new HttpError(502, "billing_provider_error", "The billing provider could not complete the request."),
    );
  });

  it("parses canonical subscription timing for reconciliation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "I-subscription",
              status: "ACTIVE",
              status_update_time: "2026-08-01T00:00:00Z",
              plan_id: "P-monthly",
              custom_id: "checkout-reference",
              subscriber: { payer_id: "payer-id" },
              billing_info: { next_billing_time: "2026-09-01T00:00:00Z" },
            }),
            { status: 200 },
          ),
        ),
    );

    await expect(getPayPalSubscription(bindings(), "I-subscription")).resolves.toMatchObject({
      status: "ACTIVE",
      statusUpdatedAt: "2026-08-01T00:00:00.000Z",
      currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
      payerId: "payer-id",
    });
  });

  it("classifies pending and settled PayPal subscription states", () => {
    expect(isPayPalCheckoutPending("APPROVAL_PENDING")).toBe(true);
    expect(isPayPalCheckoutPending("APPROVED")).toBe(true);
    expect(isPayPalCheckoutPending("ACTIVE")).toBe(false);
    expect(normalizePayPalSubscriptionStatus("ACTIVE")).toBe("active");
    expect(normalizePayPalSubscriptionStatus("SUSPENDED")).toBe("paused");
    expect(normalizePayPalSubscriptionStatus("CANCELLED")).toBe("canceled");
    expect(normalizePayPalSubscriptionStatus("APPROVAL_PENDING")).toBeNull();
  });

  it("uses the stored subscription identifier for cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelPayPalSubscription(bindings(), "I/subscription")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I%2Fsubscription/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects missing PayPal transmission headers without provider calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyPayPalWebhook(bindings(), { id: "event" }, {})).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
