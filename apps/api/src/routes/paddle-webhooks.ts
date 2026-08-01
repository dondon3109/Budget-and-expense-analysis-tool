import {
  billingSubscriptionStatuses,
  type BillingInterval,
  type BillingSubscriptionStatus,
} from "@zoption/shared";
import { Hono } from "hono";

import { verifyPaddleWebhook } from "../billing/webhook";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

const BILLING_STATUS_SET = new Set<BillingSubscriptionStatus>(billingSubscriptionStatuses);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringAt(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" && item ? item : null;
}

function canonicalTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function invalidSubscriptionEvent(eventId: string, eventType: string, reason: string): never {
  console.warn(
    JSON.stringify({
      event: "paddle_webhook_rejected",
      eventId,
      eventType,
      reason,
    }),
  );
  throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
}

function billingInterval(price: Record<string, unknown>): BillingInterval | null {
  const cycle = asRecord(price.billing_cycle);
  return cycle?.interval === "month" || cycle?.interval === "year" ? cycle.interval : null;
}

export function createPaddleWebhookRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const rawBody = await context.req.text();
    await verifyPaddleWebhook(
      rawBody,
      context.req.header("Paddle-Signature"),
      context.env.PADDLE_WEBHOOK_SECRET,
    );

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }

    const event = asRecord(payload);
    const data = event ? asRecord(event.data) : null;
    if (!event || !data) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const eventId = stringAt(event, "event_id");
    const eventType = stringAt(event, "event_type");
    const occurredAtValue = stringAt(event, "occurred_at");
    if (!eventId || !eventType || !occurredAtValue) {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }

    if (!eventType.startsWith("subscription.")) {
      return context.json({ received: true });
    }

    const occurredAt = canonicalTimestamp(occurredAtValue);
    if (!occurredAt) invalidSubscriptionEvent(eventId, eventType, "invalid_occurred_at");

    const items = Array.isArray(data.items) ? data.items : [];
    const prices = items
      .map((item) => asRecord(item))
      .map((item) => (item ? asRecord(item.price) : null))
      .filter((price): price is Record<string, unknown> => Boolean(price));
    const configuredPrice = prices.find((price) => {
      const id = stringAt(price, "id");
      return (
        id === context.env.PADDLE_PRO_MONTHLY_PRICE_ID ||
        id === context.env.PADDLE_PRO_ANNUAL_PRICE_ID
      );
    });
    const price = configuredPrice ?? prices[0] ?? null;
    const customData = asRecord(data.custom_data);
    const subscriptionId = stringAt(data, "id");
    const customerId = stringAt(data, "customer_id");
    const productId = price ? stringAt(price, "product_id") : null;
    const priceId = price ? stringAt(price, "id") : null;
    const statusValue = stringAt(data, "status");
    const interval = price ? billingInterval(price) : null;

    if (!subscriptionId || !customerId || !productId || !priceId || !statusValue || !interval) {
      invalidSubscriptionEvent(eventId, eventType, "missing_subscription_fields");
    }
    if (!BILLING_STATUS_SET.has(statusValue as BillingSubscriptionStatus)) {
      invalidSubscriptionEvent(eventId, eventType, "unknown_subscription_status");
    }

    const currentPeriod = asRecord(data.current_billing_period);
    const scheduledChange = asRecord(data.scheduled_change);
    const currentPeriodValue = stringAt(currentPeriod ?? {}, "ends_at");
    const scheduledChangeValue = stringAt(scheduledChange ?? {}, "effective_at");
    const currentPeriodEndsAt = canonicalTimestamp(currentPeriodValue);
    const scheduledChangeAt = canonicalTimestamp(scheduledChangeValue);
    if (currentPeriodValue && !currentPeriodEndsAt) {
      invalidSubscriptionEvent(eventId, eventType, "invalid_current_period");
    }
    if (scheduledChangeValue && !scheduledChangeAt) {
      invalidSubscriptionEvent(eventId, eventType, "invalid_scheduled_change");
    }

    await repository.applySubscriptionEvent(context.env, {
      provider: "paddle",
      providerEventId: eventId,
      type: eventType,
      occurredAt,
      providerSubscriptionId: subscriptionId,
      providerCustomerId: customerId,
      providerProductId: productId,
      providerPlanId: priceId,
      providerStatus: statusValue,
      status: statusValue as BillingSubscriptionStatus,
      interval,
      currentPeriodEndsAt,
      scheduledChangeAt,
      cancelAtPeriodEnd: scheduledChange?.action === "cancel",
      checkoutReference: customData ? stringAt(customData, "zoption_checkout_reference") : null,
    });

    return context.json({ received: true });
  });

  return routes;
}
