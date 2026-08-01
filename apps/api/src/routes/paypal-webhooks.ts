import type { BillingSubscriptionStatus } from "@zoption/shared";
import { Hono } from "hono";

import { getPayPalSubscription, verifyPayPalWebhook } from "../billing/paypal";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringAt(value: Record<string, unknown> | null, key: string): string | null {
  const item = value?.[key];
  return typeof item === "string" && item ? item : null;
}

function canonicalTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizedStatus(eventType: string, providerStatus: string): BillingSubscriptionStatus | null {
  if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") return "past_due";
  switch (providerStatus) {
    case "ACTIVE":
      return "active";
    case "SUSPENDED":
      return "paused";
    case "CANCELLED":
    case "EXPIRED":
      return "canceled";
    default:
      return null;
  }
}

export function createPayPalWebhookRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const rawBody = await context.req.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }

    const verified = await verifyPayPalWebhook(context.env, payload, {
      authAlgo: context.req.header("paypal-auth-algo"),
      certUrl: context.req.header("paypal-cert-url"),
      transmissionId: context.req.header("paypal-transmission-id"),
      transmissionSignature: context.req.header("paypal-transmission-sig"),
      transmissionTime: context.req.header("paypal-transmission-time"),
    });
    if (!verified) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const event = asRecord(payload);
    const eventId = stringAt(event, "id");
    const eventType = stringAt(event, "event_type");
    const occurredAt = canonicalTimestamp(stringAt(event, "create_time"));
    const resource = asRecord(event?.resource);
    const subscriptionId = stringAt(resource, "id");
    if (!event || !eventId || !eventType || !occurredAt) {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }
    if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) return context.json({ received: true });
    if (!subscriptionId) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const subscription = await getPayPalSubscription(context.env, subscriptionId);
    const status = normalizedStatus(eventType, subscription.status);
    if (!status || !subscription.customId) return context.json({ received: true });

    await repository.applySubscriptionEvent(context.env, {
      provider: "paypal",
      providerEventId: eventId,
      type: eventType,
      occurredAt,
      providerSubscriptionId: subscription.id,
      providerCustomerId: subscription.payerId,
      providerProductId: null,
      providerPlanId: subscription.planId,
      providerStatus: subscription.status,
      status,
      interval: null,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      scheduledChangeAt: null,
      cancelAtPeriodEnd: status === "canceled",
      checkoutReference: subscription.customId,
    });

    return context.json({ received: true });
  });

  return routes;
}
