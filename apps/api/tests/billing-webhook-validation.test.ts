import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { BillingRepository } from "../src/db/billing";
import type { Bindings } from "../src/types";

const WEBHOOK_SECRET = "pdl_ntfset_test_secret";
const NOW = Date.parse("2026-07-30T12:00:00.000Z");

function repository() {
  return {
    applySubscriptionEvent: vi.fn(async () => undefined),
  } as unknown as BillingRepository;
}

function environment(): Bindings {
  return {
    DB: {} as D1Database,
    PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };
}

type SubscriptionPayload = Record<string, unknown> & { data: Record<string, unknown> };

function subscriptionEvent(overrides: Record<string, unknown> = {}): SubscriptionPayload {
  return {
    event_id: "evt_01",
    event_type: "subscription.updated",
    occurred_at: "2026-07-30T11:59:00.000Z",
    data: {
      id: "sub_01",
      customer_id: "ctm_01",
      status: "active",
      items: [
        {
          price: {
            id: "pri_01",
            product_id: "pro_01",
            billing_cycle: { interval: "month", frequency: 1 },
          },
        },
      ],
      current_billing_period: {
        starts_at: "2026-07-01T00:00:00.000Z",
        ends_at: "2026-08-01T00:00:00.000Z",
      },
      scheduled_change: null,
      custom_data: { zoption_checkout_reference: "checkout-reference" },
    },
    ...overrides,
  };
}

async function signature(rawBody: string): Promise<string> {
  const timestamp = String(Math.floor(NOW / 1_000));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}:${rawBody}`)),
  );
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ts=${timestamp};h1=${hex}`;
}

async function postWebhook(billing: BillingRepository, payload: unknown) {
  const app = createApp({
    billing,
    readinessCheck: vi.fn(async () => undefined),
  });
  const rawBody = JSON.stringify(payload);
  return app.request(
    "/api/billing/paddle/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Paddle-Signature": await signature(rawBody),
      },
      body: rawBody,
    },
    environment(),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Paddle webhook payload validation", () => {
  it.each(["created", "updated", "pending", "mystery_status"])(
    "rejects unknown subscription status %s",
    async (status) => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      const billing = repository();
      const payload = subscriptionEvent();
      payload.data.status = status;

      const response = await postWebhook(billing, payload);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_webhook" });
      expect(billing.applySubscriptionEvent).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: "event occurrence",
      mutate: (payload: ReturnType<typeof subscriptionEvent>) => {
        payload.occurred_at = "not-a-timestamp";
      },
    },
    {
      name: "current period end",
      mutate: (payload: ReturnType<typeof subscriptionEvent>) => {
        payload.data.current_billing_period = {
          starts_at: "2026-07-01T00:00:00.000Z",
          ends_at: "not-a-timestamp",
        };
      },
    },
    {
      name: "scheduled change",
      mutate: (payload: ReturnType<typeof subscriptionEvent>) => {
        payload.data.scheduled_change = {
          action: "cancel",
          effective_at: "not-a-timestamp",
        };
      },
    },
  ])("rejects an invalid $name timestamp", async ({ mutate }) => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const billing = repository();
    const payload = subscriptionEvent();
    mutate(payload);

    const response = await postWebhook(billing, payload);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_webhook" });
    expect(billing.applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["subscription id", (data: Record<string, unknown>) => delete data.id],
    ["customer id", (data: Record<string, unknown>) => delete data.customer_id],
    ["status", (data: Record<string, unknown>) => delete data.status],
    ["items", (data: Record<string, unknown>) => delete data.items],
    [
      "price id",
      (data: Record<string, unknown>) => {
        const items = data.items as Array<{ price: Record<string, unknown> }>;
        delete items[0]!.price.id;
      },
    ],
    [
      "product id",
      (data: Record<string, unknown>) => {
        const items = data.items as Array<{ price: Record<string, unknown> }>;
        delete items[0]!.price.product_id;
      },
    ],
    [
      "billing interval",
      (data: Record<string, unknown>) => {
        const items = data.items as Array<{ price: Record<string, unknown> }>;
        delete items[0]!.price.billing_cycle;
      },
    ],
  ] as const)("rejects subscribed events missing %s", async (_name, removeField) => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const billing = repository();
    const payload = subscriptionEvent();
    removeField(payload.data);

    const response = await postWebhook(billing, payload);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_webhook" });
    expect(billing.applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("accepts unrelated signed events without applying subscription state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const billing = repository();

    const response = await postWebhook(billing, {
      event_id: "evt_transaction",
      event_type: "transaction.completed",
      occurred_at: "2026-07-30T11:59:00.000Z",
      data: {},
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(billing.applySubscriptionEvent).not.toHaveBeenCalled();
  });
});
