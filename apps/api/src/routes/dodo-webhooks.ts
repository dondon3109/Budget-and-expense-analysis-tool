import type { BillingInterval } from "@zoption/shared";
import { Hono } from "hono";

import {
  getDodoPayment,
  getDodoSubscription,
  isValidDodoWebhookHeaders,
  normalizeDodoSubscriptionStatus,
  verifyDodoWebhook,
} from "../billing/dodo";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import type { AppEnvironment, Bindings } from "../types";

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.renewed",
  "subscription.plan_changed",
  "subscription.past_due",
  "subscription.on_hold",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
  "payment.succeeded",
]);

/**
 * Money taken back ends the paid period at once, while Dodo may still report the subscription
 * itself as active. A partial refund is a goodwill adjustment and keeps access.
 */
const REVOCATION_EVENT_TYPES = new Map<string, string>([
  ["refund.succeeded", "refunded"],
  ["dispute.opened", "disputed"],
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

function invalidWebhook(): HttpError {
  return new HttpError(400, "invalid_webhook", "Invalid webhook request.");
}

function pendingProvider(message: string): HttpError {
  return new HttpError(503, "billing_provider_pending", message);
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
     WHERE provider = 'dodo' AND provider_subscription_id = ?`,
  )
    .bind(providerSubscriptionId)
    .first<LocalSubscription>();
}

export function createDodoWebhookRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const webhookHeaders = {
      id: context.req.header("webhook-id"),
      timestamp: context.req.header("webhook-timestamp"),
      signature: context.req.header("webhook-signature"),
    };
    if (!isValidDodoWebhookHeaders(webhookHeaders)) throw invalidWebhook();

    const rawBody = await context.req.text();
    if (!(await verifyDodoWebhook(context.env, rawBody, webhookHeaders))) throw invalidWebhook();

    let event: Record<string, unknown> | null;
    try {
      event = asRecord(JSON.parse(rawBody));
    } catch {
      throw invalidWebhook();
    }
    const eventId = webhookHeaders.id;
    const eventType = stringAt(event, "type");
    const data = asRecord(event?.data);
    if (!eventType || !data) throw invalidWebhook();

    const revokedProviderStatus = REVOCATION_EVENT_TYPES.get(eventType);
    if (revokedProviderStatus) {
      const paymentId = stringAt(data, "payment_id");
      if (!paymentId) throw invalidWebhook();
      if (eventType === "refund.succeeded" && data.is_partial === true) {
        return context.json({ received: true });
      }

      const payment = await getDodoPayment(context.env, paymentId);
      const subscription = payment.subscriptionId
        ? await localSubscription(context.env, payment.subscriptionId)
        : null;
      if (!subscription) {
        // Nothing local matches this payment, so there is nothing to revoke and no retry
        // would change that. The identifiers are logged for a manual billing review.
        console.warn(
          JSON.stringify({
            message: "Dodo revocation event was not matched to a subscription",
            eventId,
            eventType,
            paymentId,
          }),
        );
        return context.json({ received: true });
      }

      const occurredAt = new Date().toISOString();
      const applyOutcome = await repository.applySubscriptionEvent(context.env, {
        provider: "dodo",
        providerEventId: eventId,
        type: eventType,
        occurredAt,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerCustomerId: subscription.providerCustomerId,
        providerProductId: subscription.providerPlanId,
        providerPlanId: subscription.providerPlanId,
        providerStatus: revokedProviderStatus,
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
          message: "Dodo revocation processed",
          eventId,
          eventType,
          subscriptionId: subscription.providerSubscriptionId,
          applyOutcome,
        }),
      );
      return context.json({ received: true });
    }

    if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) return context.json({ received: true });

    const subscriptionId = stringAt(data, "subscription_id");
    if (!subscriptionId) {
      // A one-time payment carries no subscription and grants nothing.
      if (eventType === "payment.succeeded") return context.json({ received: true });
      throw invalidWebhook();
    }

    // The payload is only a pointer: the subscription is read back from Dodo, so a delayed
    // or reordered delivery applies the provider's current state rather than a stale one.
    const subscription = await getDodoSubscription(context.env, subscriptionId);
    const checkoutReference = await repository.linkCheckoutSubscription(
      context.env,
      "dodo",
      {
        providerCheckoutId: stringAt(data, "checkout_session_id"),
        reference:
          subscription.checkoutReference ?? stringAt(asRecord(data.metadata), "checkout_reference"),
      },
      subscriptionId,
    );
    if (subscription.status === "pending") {
      throw pendingProvider("The billing provider has not finalized the subscription yet.");
    }

    const status = normalizeDodoSubscriptionStatus(subscription.status);
    if (!status) {
      throw pendingProvider("The billing provider returned an incomplete subscription status.");
    }
    if (
      status === "active" &&
      (!subscription.nextBillingDate ||
        new Date(subscription.nextBillingDate).getTime() <= Date.now())
    ) {
      throw pendingProvider("The billing provider has not confirmed the paid period yet.");
    }

    const applyOutcome = await repository.applySubscriptionEvent(context.env, {
      provider: "dodo",
      providerEventId: eventId,
      type: eventType,
      occurredAt: new Date().toISOString(),
      providerSubscriptionId: subscription.id,
      providerCustomerId: subscription.customerId,
      providerProductId: subscription.productId,
      providerPlanId: subscription.productId,
      providerStatus: subscription.status,
      status,
      interval: null,
      currentPeriodEndsAt: subscription.nextBillingDate,
      scheduledChangeAt: null,
      cancelAtPeriodEnd: subscription.cancelAtNextBillingDate,
      checkoutReference,
    });
    if (applyOutcome === "unmatched" || applyOutcome === "rejected_plan") {
      console.warn(
        JSON.stringify({
          message: "Dodo webhook subscription was not applied",
          eventId,
          eventType,
          subscriptionId,
          providerStatus: subscription.status,
          applyOutcome,
        }),
      );
      throw pendingProvider("The billing provider subscription could not be matched yet.");
    }

    console.log(
      JSON.stringify({
        message: "Dodo webhook processed",
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
