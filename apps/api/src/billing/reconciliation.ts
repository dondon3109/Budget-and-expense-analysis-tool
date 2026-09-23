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
  getDodoCheckoutSessionPaymentId,
  getDodoPayment,
  getDodoSubscription,
  normalizeDodoSubscriptionStatus,
  type DodoPayment,
  type DodoSubscription,
} from "./dodo";
import {
  cancelPayPalSubscription,
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

interface ReconciliationOptions {
  abortPendingCheckout?: boolean;
}

/** Applies a verified provider state and, for an active one, proves it was persisted. */
async function applyReconciledSubscription(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  checkout: BillingCheckoutReference,
  snapshot: BillingSubscriptionSnapshot,
): Promise<BillingCheckoutReconciliation> {
  const applyOutcome = await repository.applySubscriptionSnapshot(env, snapshot);
  if (invalidApplicationOutcome(applyOutcome)) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider subscription could not be matched to this checkout.",
    );
  }

  const summary = await repository.getSummary(env, tenantId);
  if (snapshot.status === "canceled") return { outcome: "closed", summary };

  if (snapshot.status === "active") {
    const persisted = await repository.getProviderSubscription(env, tenantId, snapshot.provider);
    const confirmed =
      persisted?.providerSubscriptionId === snapshot.providerSubscriptionId &&
      persisted.status === "active" &&
      isFutureTimestamp(persisted.currentPeriodEndsAt) &&
      summary.entitlementSource === snapshot.provider &&
      summary.provider === snapshot.provider &&
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

export async function reconcileBillingCheckout(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  options: ReconciliationOptions = {},
): Promise<BillingCheckoutReconciliation> {
  const checkout = await repository.getPendingCheckout(env, tenantId);
  if (checkout?.provider === "dodo") {
    return reconcileDodoCheckout(repository, env, tenantId, checkout, options);
  }
  if (!checkout?.providerSubscriptionId) {
    return { outcome: "none", summary: await repository.getSummary(env, tenantId) };
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
    // A subscription still awaiting buyer approval has not been charged. If the checkout
    // window has already expired, treat it as abandoned: cancel the unpaid subscription and
    // close the checkout so the tenant can start a fresh one. An APPROVED subscription (the
    // buyer approved and payment may be settling) stays under review until PayPal finalizes it.
    // When the buyer explicitly cancels the PayPal approval (cancel_url), allow the frontend
    // to abort the pending checkout immediately without waiting for expiry.
    const shouldAbortPending =
      subscription.status === "APPROVAL_PENDING" &&
      (pendingOutcome(checkout) === "review_required" || options.abortPendingCheckout === true);
    if (shouldAbortPending) {
      await cancelPayPalSubscription(env, checkout.providerSubscriptionId).catch(() => {});
      await repository.supersedePendingCheckout(env, tenantId, checkout.reference);
      return {
        outcome: "closed",
        summary: await repository.getSummary(env, tenantId),
      };
    }
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
  return applyReconciledSubscription(
    repository,
    env,
    tenantId,
    checkout,
    subscriptionSnapshot(subscription, checkout, status),
  );
}

/**
 * A Dodo checkout is a hosted session: the subscription only exists once the buyer pays, and
 * the session's payment names it. An unpaid session cannot be cancelled at Dodo, so closing it
 * here only stops Zoption waiting; a late payment still links through the session id.
 */
async function reconcileDodoCheckout(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  checkout: BillingCheckoutReference,
  options: ReconciliationOptions,
): Promise<BillingCheckoutReconciliation> {
  const recordFailure = async (providerStatus: string | null, errorCode: string) => {
    await repository.recordCheckoutReconciliation(
      env,
      tenantId,
      checkout.reference,
      providerStatus,
      errorCode,
    );
  };

  let subscriptionId = checkout.providerSubscriptionId;
  if (!subscriptionId) {
    let payment: DodoPayment | null;
    try {
      const paymentId = await getDodoCheckoutSessionPaymentId(env, checkout.providerCheckoutId!);
      payment = paymentId ? await getDodoPayment(env, paymentId) : null;
    } catch (error) {
      await recordFailure(null, error instanceof HttpError ? error.code : "billing_provider_error");
      throw error;
    }
    if (payment && payment.checkoutSessionId !== checkout.providerCheckoutId) {
      await recordFailure(payment.status, "invalid_checkout_details");
      throw new HttpError(
        502,
        "billing_provider_error",
        "The billing provider returned invalid checkout details.",
      );
    }

    subscriptionId = payment?.status === "succeeded" ? payment.subscriptionId : null;
    if (!subscriptionId) {
      const unpaid = payment?.status !== "processing" && payment?.status !== "succeeded";
      if (
        unpaid &&
        (options.abortPendingCheckout === true || pendingOutcome(checkout) === "review_required")
      ) {
        await repository.supersedePendingCheckout(env, tenantId, checkout.reference);
        return { outcome: "closed", summary: await repository.getSummary(env, tenantId) };
      }
      await repository.recordCheckoutReconciliation(
        env,
        tenantId,
        checkout.reference,
        payment?.status ?? null,
        null,
      );
      return {
        outcome: pendingOutcome(checkout),
        summary: await repository.getSummary(env, tenantId),
      };
    }

    const linked = await repository.linkCheckoutSubscription(
      env,
      "dodo",
      { providerCheckoutId: checkout.providerCheckoutId, reference: checkout.reference },
      subscriptionId,
    );
    if (linked !== checkout.reference) {
      await recordFailure(payment?.status ?? null, "invalid_checkout_details");
      throw new HttpError(
        502,
        "billing_provider_error",
        "The billing provider subscription could not be matched to this checkout.",
      );
    }
  }

  let subscription: DodoSubscription;
  try {
    subscription = await getDodoSubscription(env, subscriptionId);
  } catch (error) {
    await recordFailure(null, error instanceof HttpError ? error.code : "billing_provider_error");
    throw error;
  }
  if (subscription.productId !== checkout.providerPlanId) {
    await recordFailure(subscription.status, "invalid_checkout_details");
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned invalid checkout details.",
    );
  }
  if (subscription.status === "pending") {
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

  const status = normalizeDodoSubscriptionStatus(subscription.status);
  if (!status) {
    await recordFailure(subscription.status, "incomplete_subscription_status");
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned an incomplete subscription status.",
    );
  }
  if (status === "active" && !isFutureTimestamp(subscription.nextBillingDate)) {
    await recordFailure(subscription.status, "paid_period_unconfirmed");
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
  const occurredAt = new Date().toISOString();
  return applyReconciledSubscription(repository, env, tenantId, checkout, {
    provider: "dodo",
    providerUpdateId: `reconcile:${subscription.id}:${occurredAt}:${subscription.status}`,
    occurredAt,
    providerSubscriptionId: subscription.id,
    providerCustomerId: subscription.customerId,
    providerProductId: subscription.productId,
    providerPlanId: subscription.productId,
    providerStatus: subscription.status,
    status,
    interval: checkout.interval,
    currentPeriodEndsAt: subscription.nextBillingDate,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: subscription.cancelAtNextBillingDate,
    checkoutReference: checkout.reference,
  });
}
