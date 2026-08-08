import { describe, expect, it } from "vitest";

import { setupPayPalLive } from "./setup-paypal-live.mjs";

const eventTypes = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queuedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  };
  return { calls, fetchImpl };
}

describe("setupPayPalLive", () => {
  it("creates a webhook with the exact subscription event set", async () => {
    const webhookUrl = "https://api.zoption.site/api/billing/paypal/webhook";
    const { calls, fetchImpl } = queuedFetch([
      json({ access_token: "live-access-token" }),
      json({ products: [], total_pages: 1 }),
      json({ id: "PROD-1" }, 201),
      json({ plans: [], total_pages: 1 }),
      json({ id: "P-MONTHLY" }, 201),
      json({ plans: [], total_pages: 1 }),
      json({ id: "P-ANNUAL" }, 201),
      json({ webhooks: [] }),
      json({ id: "WH-LIVE" }, 201),
    ]);

    await expect(
      setupPayPalLive({
        env: {
          PAYPAL_CLIENT_ID: "live-client-id",
          PAYPAL_CLIENT_SECRET: "live-client-secret",
        },
        fetchImpl,
        apply: true,
        webhookUrls: [webhookUrl],
      }),
    ).resolves.toMatchObject({
      mode: "apply",
      webhooks: { [webhookUrl]: { id: "WH-LIVE", action: "create" } },
    });

    const createWebhook = calls.find(
      (call) => call.url.endsWith("/v1/notifications/webhooks") && call.init.method === "POST",
    );
    expect(JSON.parse(createWebhook.init.body)).toEqual({
      url: webhookUrl,
      event_types: eventTypes.map((name) => ({ name })),
    });
    expect(calls.every((call) => call.url.startsWith("https://api-m.paypal.com/"))).toBe(true);
  });
});
