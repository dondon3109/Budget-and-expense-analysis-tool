import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelPayPalSubscription,
  clearPayPalAccessTokenCacheForTesting,
  createPayPalSubscription,
  getPayPalBrowserConfiguration,
  getPayPalSubscription,
  isPayPalCheckoutPending,
  normalizePayPalSubscriptionStatus,
  verifyPayPalWebhook,
} from "../src/billing/paypal";
import { HttpError } from "../src/errors";
import type { Bindings } from "../src/types";

let nowMs = Date.parse("2026-08-01T00:02:00.000Z");

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

function tokenResponse(token = "access-token", expiresIn = 3_600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
    status: 200,
  });
}

function subscriptionResponse(id = "I-subscription") {
  return new Response(
    JSON.stringify({
      id,
      status: "ACTIVE",
      status_update_time: "2026-08-01T00:00:00Z",
      plan_id: "P-monthly",
      custom_id: "checkout-reference",
      subscriber: { payer_id: "payer-id" },
      billing_info: { next_billing_time: "2026-09-01T00:00:00Z" },
    }),
    { status: 200 },
  );
}

function validWebhookHeaders() {
  return {
    authAlgo: "SHA256withRSA",
    certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-example",
    transmissionId: "transmission-id",
    transmissionSignature: "c2lnbmF0dXJlLXNpZ25hdHVyZQ==",
    transmissionTime: "2026-08-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  nowMs = Date.parse("2026-08-01T00:02:00.000Z");
  vi.spyOn(Date, "now").mockImplementation(() => nowMs);
  clearPayPalAccessTokenCacheForTesting();
});

afterEach(() => {
  clearPayPalAccessTokenCacheForTesting();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PayPal subscription gateway", () => {
  it("exposes only the public browser SDK configuration", () => {
    expect(getPayPalBrowserConfiguration(bindings())).toEqual({
      clientId: "client-id",
      environment: "sandbox",
    });
    expect(getPayPalBrowserConfiguration(bindings())).not.toHaveProperty("clientSecret");
  });

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
      new HttpError(
        502,
        "billing_provider_error",
        "The billing provider could not complete the request.",
      ),
    );
  });

  it("parses canonical subscription timing for reconciliation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(subscriptionResponse()),
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
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

  it.each([
    ["unsupported algorithm", { authAlgo: "SHA1withRSA" }],
    ["oversized transmission ID", { transmissionId: "a".repeat(129) }],
    ["control characters", { transmissionSignature: "signature\nvalue" }],
    [
      "wrong-environment certificate URL",
      { certUrl: "https://api.paypal.com/v1/notifications/certs/CERT-example" },
    ],
    ["unexpected certificate path", { certUrl: "https://api.sandbox.paypal.com/cert.pem" }],
    ["invalid transmission time", { transmissionTime: "2026-02-30T00:00:00.000Z" }],
  ])("rejects %s before obtaining an OAuth token", async (_label, override) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyPayPalWebhook(bindings(), { id: "event" }, { ...validWebhookHeaders(), ...override }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an old but well-formed transmission time for provider verification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyPayPalWebhook(
        bindings(),
        { id: "event" },
        {
          ...validWebhookHeaders(),
          transmissionTime: "2026-07-31T23:00:00.000Z",
        },
      ),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses a valid isolate-local OAuth token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("cached-token"))
      .mockResolvedValueOnce(subscriptionResponse("I-one"))
      .mockResolvedValueOnce(subscriptionResponse("I-two"));
    vi.stubGlobal("fetch", fetchMock);
    const env = bindings();

    await getPayPalSubscription(env, "I-one");
    await getPayPalSubscription(env, "I-two");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/v1/oauth2/token")),
    ).toHaveLength(1);
  });

  it("coalesces concurrent OAuth token requests", async () => {
    let resolveToken!: (response: Response) => void;
    const pendingToken = new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/v1/oauth2/token")) return pendingToken;
      return subscriptionResponse(url.endsWith("I-one") ? "I-one" : "I-two");
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = bindings();

    const first = getPayPalSubscription(env, "I-one");
    const second = getPayPalSubscription(env, "I-two");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveToken(tokenResponse("shared-token"));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes an OAuth token after its safety-adjusted expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("first-token", 120))
      .mockResolvedValueOnce(subscriptionResponse("I-one"))
      .mockResolvedValueOnce(tokenResponse("second-token", 120))
      .mockResolvedValueOnce(subscriptionResponse("I-two"));
    vi.stubGlobal("fetch", fetchMock);
    const env = bindings();

    await getPayPalSubscription(env, "I-one");
    nowMs += 61_000;
    await getPayPalSubscription(env, "I-two");

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/v1/oauth2/token")),
    ).toHaveLength(2);
  });

  it("refreshes and retries once after a provider 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("expired-token"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("refreshed-token"))
      .mockResolvedValueOnce(subscriptionResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPayPalSubscription(bindings(), "I-subscription")).resolves.toMatchObject({
      id: "I-subscription",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer expired-token" },
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer refreshed-token" },
    });
  });

  it("does not retry a second provider 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("expired-token"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("refreshed-token"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPayPalSubscription(bindings(), "I-subscription")).rejects.toMatchObject({
      code: "billing_provider_error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("clears failed OAuth requests so a later call can recover", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(tokenResponse("recovered-token"))
      .mockResolvedValueOnce(subscriptionResponse());
    vi.stubGlobal("fetch", fetchMock);
    const env = bindings();

    await expect(getPayPalSubscription(env, "I-subscription")).rejects.toMatchObject({
      code: "billing_provider_error",
    });
    await expect(getPayPalSubscription(env, "I-subscription")).resolves.toMatchObject({
      id: "I-subscription",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
