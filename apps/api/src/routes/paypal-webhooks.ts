import type { BillingInterval } from "@zoption/shared";
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
import type { AppEnvironment, Bindings } from "../types";

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "CUSTOMER.DISPUTE.CREATED",
]);

/**
 * A refunded payment, a reversed capture, or a dispute means the money did not settle. These
 * events terminate the subscription locally with the provider status recorded here, because
 * PayPal keeps reporting the agreement itself as ACTIVE.
 */
const REVOCATION_EVENT_TYPES = new Map<string, string>([
  ["PAYMENT.SALE.REFUNDED", "REFUNDED"],
  ["PAYMENT.CAPTURE.REVERSED", "REVERSED"],
  ["CUSTOMER.DISPUTE.CREATED", "DISPUTED"],
]);

interface LocalSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPlanId: string;
  interval: BillingInterval | null;
}

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

/**
 * The subscription a revocation event names, as far as the signed payload identifies it.
 * Sale-linked resources carry the agreement id; capture and dispute resources instead echo
 * the checkout reference the subscription was created with, which the checkout rows resolve.
 */
async function revokedSubscriptionId(
  env: Bindings,
  resource: Record<string, unknown> | null,
): Promise<string | null> {
  const agreementId = stringAt(resource, "billing_agreement_id");
  if (agreementId) return agreementId;

  const checkoutReference = stringAt(resource, "custom_id");
  if (!checkoutReference) return null;
  const row = await env.DB.prepare(
    `SELECT provider_subscription_id AS providerSubscriptionId
     FROM billing_checkout_references
     WHERE provider = 'paypal' AND id = ? AND provider_subscription_id IS NOT NULL`,
  )
    .bind(checkoutReference)
    .first<{ providerSubscriptionId: string }>();
  return row?.providerSubscriptionId ?? null;
}

async function localSubscription(
  env: Bindings,
  providerSubscriptionId: string,
): Promise<LocalSubscription | null> {
  return env.DB.prepare(
    `SELECT provider_subscription_id AS providerSubscriptionId,
            provider_customer_id AS providerCustomerId,
            provider_plan_id AS providerPlanId,
            interval
     FROM billing_subscriptions
     WHERE provider = 'paypal' AND provider_subscription_id = ?`,
  )
    .bind(providerSubscriptionId)
    .first<LocalSubscription>();
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

    // Verification runs on the raw signed bytes; the parsed payload below only reads fields.
    const verified = await verifyPayPalWebhook(context.env, rawBody, webhookHeaders);
    if (!verified) throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");

    const event = asRecord(payload);
    const eventId = stringAt(event, "id");
    const eventType = stringAt(event, "event_type");
    const occurredAt = canonicalTimestamp(stringAt(event, "create_time"));
    const resource = asRecord(event?.resource);
    if (!event || !eventId || !eventType || !occurredAt) {
      throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
    }
    if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) return context.json({ received: true });

    const revokedProviderStatus = REVOCATION_EVENT_TYPES.get(eventType);
    if (revokedProviderStatus) {
      const providerSubscriptionId = await revokedSubscriptionId(context.env, resource);
      const subscription = providerSubscriptionId
        ? await localSubscription(context.env, providerSubscriptionId)
        : null;
      if (!subscription) {
        // Nothing local matches this payment, so there is nothing to revoke and no retry
        // would change that. The identifiers are logged for a manual billing review.
        console.warn(
          JSON.stringify({
            message: "PayPal revocation event was not matched to a subscription",
            eventId,
            eventType,
            resourceId: stringAt(resource, "id"),
            resourceType: stringAt(event, "resource_type"),
          }),
        );
        return context.json({ received: true });
      }

      const applyOutcome = await repository.applySubscriptionEvent(context.env, {
        provider: "paypal",
        providerEventId: eventId,
        type: eventType,
        occurredAt,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerCustomerId: subscription.providerCustomerId,
        providerProductId: null,
        providerPlanId: subscription.providerPlanId,
        providerStatus: revokedProviderStatus,
        // Terminal immediately: the paid period is over at the moment the money was taken back.
        // The plan may no longer be sellable, so the revocation skips the plan check and keeps
        // the interval already recorded for this subscription.
        status: "canceled",
        interval: subscription.interval,
        currentPeriodEndsAt: occurredAt,
        scheduledChangeAt: null,
        cancelAtPeriodEnd: false,
        checkoutReference: null,
        revocation: true,
      });
      console.log(
        JSON.stringify({
          message: "PayPal revocation processed",
          eventId,
          eventType,
          subscriptionId: subscription.providerSubscriptionId,
          applyOutcome,
        }),
      );
      return context.json({ received: true });
    }

    const subscriptionId =
      eventType === "PAYMENT.SALE.COMPLETED"
        ? stringAt(resource, "billing_agreement_id")
        : stringAt(resource, "id");
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
