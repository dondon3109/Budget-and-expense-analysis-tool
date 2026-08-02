import type { BillingCheckoutReconciliation } from "@zoption/shared";

import type {
  BillingCheckoutReference,
  BillingRepository,
  BillingSubscriptionApplyOutcome,
  BillingSubscriptionSnapshot,
} from "../db/billing";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import {
  getPayPalSubscription,
  isPayPalCheckoutPending,
  normalizePayPalSubscriptionStatus,
  type PayPalSubscription,
} from "./paypal";

function isFutureTimestamp(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function pendingOutcome(checkout: BillingCheckoutReference): "pending" | "review_required" {
  const expiresAt = new Date(checkout.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() ? "review_required" : "pending";
}

function subscriptionSnapshot(
  subscription: PayPalSubscription,
  checkout: BillingCheckoutReference,
  status: NonNullable<ReturnType<typeof normalizePayPalSubscriptionStatus>>,
): BillingSubscriptionSnapshot {
  return {
    provider: "paypal",
    providerUpdateId: `reconcile:${subscription.id}:${subscription.statusUpdatedAt}:${subscription.status}`,
    occurredAt: subscription.statusUpdatedAt!,
    providerSubscriptionId: subscription.id,
    providerCustomerId: subscription.payerId,
    providerProductId: null,
    providerPlanId: subscription.planId,
    providerStatus: subscription.status,
    status,
    interval: checkout.interval,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    checkoutReference: checkout.reference,
  };
}

function invalidApplicationOutcome(outcome: BillingSubscriptionApplyOutcome): boolean {
  return outcome === "unmatched" || outcome === "rejected_plan";
}

export async function reconcilePayPalCheckout(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
): Promise<BillingCheckoutReconciliation> {
  const checkout = await repository.getPendingCheckout(env, tenantId);
  if (!checkout?.providerSubscriptionId) {
    return { outcome: "none", summary: await repository.getSummary(env, tenantId) };
  }
  if (checkout.provider !== "paypal") {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }

  let subscription: PayPalSubscription;
  try {
    subscription = await getPayPalSubscription(env, checkout.providerSubscriptionId);
  } catch (error) {
    const errorCode = error instanceof HttpError ? error.code : "billing_provider_error";
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      null,
      errorCode,
    );
    throw error;
  }

  if (
    subscription.id !== checkout.providerSubscriptionId ||
    subscription.planId !== checkout.providerPlanId ||
    subscription.customId !== checkout.reference
  ) {
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      subscription.status,
      "invalid_checkout_details",
    );
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned invalid checkout details.",
    );
  }

  if (isPayPalCheckoutPending(subscription.status)) {
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      subscription.status,
      null,
    );
    return {
      outcome: pendingOutcome(checkout),
      summary: await repository.getSummary(env, tenantId),
    };
  }

  const status = normalizePayPalSubscriptionStatus(subscription.status);
  if (!status || !subscription.statusUpdatedAt) {
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      subscription.status,
      "incomplete_subscription_status",
    );
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned an incomplete subscription status.",
    );
  }
  if (status === "active" && !isFutureTimestamp(subscription.currentPeriodEndsAt)) {
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      subscription.status,
      "paid_period_unconfirmed",
    );
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider has not confirmed the paid period yet.",
    );
  }

  await repository.recordCheckoutReconciliation(
    env,
    tenantId,
    checkout.reference,
    subscription.status,
    null,
  );
  const applyOutcome = await repository.applySubscriptionSnapshot(
    env,
    subscriptionSnapshot(subscription, checkout, status),
  );
  if (invalidApplicationOutcome(applyOutcome)) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider subscription could not be matched to this checkout.",
    );
  }

  const summary = await repository.getSummary(env, tenantId);
  if (status === "canceled") return { outcome: "closed", summary };

  if (status === "active") {
    const persisted = await repository.getProviderSubscription(env, tenantId, "paypal");
    const confirmed =
      persisted?.providerSubscriptionId === subscription.id &&
      persisted.status === "active" &&
      isFutureTimestamp(persisted.currentPeriodEndsAt) &&
      summary.entitlementSource === "paypal" &&
      summary.provider === "paypal" &&
      summary.status === "active" &&
      summary.pendingCheckout === null;
    if (!confirmed) {
      throw new HttpError(
        502,
        "billing_provider_error",
        "The billing provider subscription was not persisted correctly.",
      );
    }
    return { outcome: "confirmed", summary };
  }

  return { outcome: pendingOutcome(checkout), summary };
}
