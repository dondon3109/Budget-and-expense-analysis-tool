import { Hono } from "hono";

import {
  getPayPalSubscription,
  isPayPalCheckoutPending,
  isValidPayPalWebhookHeaders,
  normalizePayPalSubscriptionStatus,
  verifyPayPalWebhook,
} from "../billing/paypal";
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
  "PAYMENT.SALE.COMPLETED",
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

export function createPayPalWebhookRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const webhookHeaders = {
      authAlgo: context.req.header("paypal-auth-algo"),
      certUrl: context.req.header("paypal-cert-url"),
      transmissionId: context.req.header("paypal-transmission-id"),
      transmissionSignature: context.req.header("paypal-transmission-sig"),
      transmissionTime: context.req.header("paypal-transmission-time"),
    };
    if (!isValidPayPalWebhookHeaders(context.env, webhookHeaders)) {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }

    const rawBody = await context.req.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }

    const verified = await verifyPayPalWebhook(context.env, payload, webhookHeaders);
    if (!verified) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const event = asRecord(payload);
    const eventId = stringAt(event, "id");
    const eventType = stringAt(event, "event_type");
    const occurredAt = canonicalTimestamp(stringAt(event, "create_time"));
    const resource = asRecord(event?.resource);
    const subscriptionId =
      eventType === "PAYMENT.SALE.COMPLETED"
        ? stringAt(resource, "billing_agreement_id")
        : stringAt(resource, "id");
    if (!event || !eventId || !eventType || !occurredAt) {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }
    if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) return context.json({ received: true });
    if (!subscriptionId) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const subscription = await getPayPalSubscription(context.env, subscriptionId);
    if (isPayPalCheckoutPending(subscription.status)) {
      console.warn(
        JSON.stringify({
          message: "PayPal webhook canonical state is still pending",
          eventId,
          eventType,
          subscriptionId,
          providerStatus: subscription.status,
        }),
      );
      throw new HttpError(
        503,
        "billing_provider_pending",
        "The billing provider has not finalized the subscription yet.",
      );
    }

    const canonicalStatus = normalizePayPalSubscriptionStatus(subscription.status);
    const status =
      eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" && canonicalStatus === "active"
        ? "past_due"
        : canonicalStatus;
    if (!status || !subscription.statusUpdatedAt) {
      throw new HttpError(
        503,
        "billing_provider_pending",
        "The billing provider returned an incomplete subscription status.",
      );
    }
    if (
      status === "active" &&
      (!subscription.currentPeriodEndsAt ||
        new Date(subscription.currentPeriodEndsAt).getTime() <= Date.now())
    ) {
      throw new HttpError(
        503,
        "billing_provider_pending",
        "The billing provider has not confirmed the paid period yet.",
      );
    }

    const applyOutcome = await repository.applySubscriptionEvent(context.env, {
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
    if (applyOutcome === "unmatched" || applyOutcome === "rejected_plan") {
      console.warn(
        JSON.stringify({
          message: "PayPal webhook subscription was not applied",
          eventId,
          eventType,
          subscriptionId,
          providerStatus: subscription.status,
          applyOutcome,
        }),
      );
      throw new HttpError(
        503,
        "billing_provider_pending",
        "The billing provider subscription could not be matched yet.",
      );
    }

    console.log(
      JSON.stringify({
        message: "PayPal webhook processed",
        eventId,
        eventType,
        subscriptionId,
        providerStatus: subscription.status,
        applyOutcome,
      }),
    );
    return context.json({ received: true });
  });

  return routes;
}
