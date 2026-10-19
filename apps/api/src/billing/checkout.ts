import {
  planChangeDirection,
  type BillingCheckoutResponse,
  type BillingPlanChangeRequest,
  type BillingPlanChangeResponse,
} from "@zoption/shared";

import type {
  BillingProviderSubscription,
  BillingRepository,
  CheckoutRequest,
} from "../db/billing";
import { tenantIdForUser } from "../db/tenants";
import { HttpError } from "../errors";
import { enqueueJob } from "../jobs";
import type { AuthUser, Bindings, TenantContext } from "../types";
import {
  cancelDodoSubscription,
  changeDodoSubscriptionPlan,
  createDodoCheckoutSession,
  getDodoCheckoutSessionPaymentId,
} from "./dodo";
import {
  cancelPayPalSubscription,
  createPayPalSubscription,
  getPayPalSubscription,
  revisePayPalSubscription,
} from "./paypal";
import { configuredPlanId } from "./plan-ids";
import { reconcileBillingCheckout } from "./reconciliation";

// Starting, changing, and cancelling a plan. Personal plans and family plans share these; a
// family plan is a subscription on its owner's personal workspace that names the family.

/**
 * Who a family plan request acts for: the family the workspace header names, which only its
 * owner may manage, and the owner's personal workspace, which pays.
 */
export function familyPlanPayer(tenant: TenantContext, user: AuthUser) {
  if (!tenant.membership) {
    throw new HttpError(400, "family_required", "Open a family workspace first.");
  }
  if (tenant.membership.role !== "owner") {
    throw new HttpError(403, "family_owner_required", "Only the family owner can do this.");
  }
  return { familyTenantId: tenant.tenantId, payerTenantId: tenantIdForUser(user.id) };
}

/** Opens a provider checkout and returns where the buyer approves it. */
export async function startCheckout(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  request: CheckoutRequest,
): Promise<BillingCheckoutResponse> {
  let checkout = await repository.createCheckoutReference(env, tenantId, request);
  if (checkout.provider !== request.provider) {
    throw new HttpError(
      409,
      "checkout_in_progress",
      "A checkout is already open. Finish it or wait for it to expire.",
    );
  }

  if (checkout.provider === "dodo") {
    // Dodo cannot reopen a session, so a repeat request waits on a paid one and replaces an
    // unpaid one. A superseded session paid later still links to its checkout and grants access.
    if (checkout.providerCheckoutId) {
      if (await getDodoCheckoutSessionPaymentId(env, checkout.providerCheckoutId)) {
        throw new HttpError(
          409,
          "checkout_awaiting_confirmation",
          "Payment confirmation is already in progress. Check Plan and billing for updates.",
          { billingPath: "/app/settings#plan-and-billing" },
        );
      }
      await repository.supersedePendingCheckout(env, tenantId, checkout.reference);
      checkout = await repository.createCheckoutReference(env, tenantId, request);
    }
    const session = await createDodoCheckoutSession(env, {
      productId: checkout.providerPlanId,
      checkoutReference: checkout.reference,
      family: request.familyTenantId !== null,
    });
    await repository.bindCheckoutProviderSession(
      env,
      tenantId,
      checkout.reference,
      "dodo",
      session.sessionId,
    );
    await enqueueJob(env, { type: "billing-reconcile", tenantId }, { delaySeconds: 30 });
    return { approvalUrl: session.checkoutUrl };
  }

  const subscription = checkout.providerSubscriptionId
    ? await getPayPalSubscription(env, checkout.providerSubscriptionId)
    : await createPayPalSubscription(env, {
        planId: checkout.providerPlanId,
        checkoutReference: checkout.reference,
        family: request.familyTenantId !== null,
      });
  if (
    subscription.planId !== checkout.providerPlanId ||
    subscription.customId !== checkout.reference
  ) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider could not complete the request.",
    );
  }
  if (!checkout.providerSubscriptionId) {
    await repository.bindCheckoutProviderSubscription(
      env,
      tenantId,
      checkout.reference,
      "paypal",
      subscription.id,
    );
  }
  if (!subscription.approvalUrl) {
    const reconciliation = await reconcileBillingCheckout(repository, env, tenantId);
    if (reconciliation.outcome === "confirmed") {
      throw new HttpError(
        409,
        "checkout_confirmed",
        "Your subscription has been confirmed. Refresh Plan and billing to see your access.",
      );
    }
    if (reconciliation.outcome === "closed") {
      throw new HttpError(
        409,
        "checkout_closed",
        "The previous checkout is no longer active. Start checkout again to subscribe.",
      );
    }
    throw new HttpError(
      409,
      "checkout_awaiting_confirmation",
      "Payment confirmation is already in progress. Check Plan and billing for updates.",
      { billingPath: "/app/settings#plan-and-billing" },
    );
  }
  await enqueueJob(env, { type: "billing-reconcile", tenantId }, { delaySeconds: 30 });
  return { approvalUrl: subscription.approvalUrl, subscriptionId: subscription.id };
}

/** The subscription a plan change acts on, with the plan and interval it renews at. */
async function renewingSubscription(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  familyTenantId: string | null,
) {
  const subscription = await repository.getProviderSubscription(env, tenantId, familyTenantId);
  if (
    !subscription?.plan ||
    !subscription.interval ||
    subscription.cancelAtPeriodEnd ||
    (subscription.status !== "active" && subscription.status !== "trialing")
  ) {
    throw new HttpError(
      409,
      "plan_change_unavailable",
      "Only a paid plan that is still renewing can be changed.",
    );
  }
  return {
    subscription,
    current: { plan: subscription.plan, interval: subscription.interval },
  };
}

/**
 * Moves the subscription to another plan or interval. An upgrade applies now; a downgrade keeps
 * the current tier until the paid period ends. PayPal bills an upgrade from the next cycle, so
 * the new tier is granted up front until then.
 */
export async function changePlan(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  familyTenantId: string | null,
  target: BillingPlanChangeRequest,
): Promise<BillingPlanChangeResponse> {
  const { subscription, current } = await renewingSubscription(
    repository,
    env,
    tenantId,
    familyTenantId,
  );
  const direction = planChangeDirection(current, target);
  if (direction === "same") {
    throw new HttpError(409, "plan_unchanged", "You are already on this plan.");
  }
  if ((familyTenantId !== null) !== target.plan.startsWith("family_")) {
    throw new HttpError(400, "invalid_request", "Choose a plan that matches the workspace.");
  }
  const providerPlanId = configuredPlanId(env, subscription.provider, target.plan, target.interval);
  const periodEnd = subscription.currentPeriodEndsAt;

  let approvalUrl: string | null = null;
  if (subscription.provider === "dodo") {
    await changeDodoSubscriptionPlan(
      env,
      subscription.providerSubscriptionId,
      providerPlanId,
      direction === "upgrade" ? "prorated_immediately" : "do_not_bill",
    );
  } else {
    ({ approvalUrl } = await revisePayPalSubscription(
      env,
      subscription.providerSubscriptionId,
      providerPlanId,
    ));
  }

  if (direction === "downgrade") {
    // The old tier is kept to the end of the period either way. Without approval the plan does
    // not change, so no pending change is shown.
    await repository.recordPlanChange(env, tenantId, subscription, {
      plan: approvalUrl ? current.plan : target.plan,
      interval: approvalUrl ? current.interval : target.interval,
      providerPlanId: approvalUrl ? subscription.providerPlanId : providerPlanId,
      entitledPlan: current.plan,
      entitledUntil: periodEnd,
      pending: approvalUrl ? null : target,
    });
    return { outcome: approvalUrl ? "approval_required" : "scheduled", approvalUrl };
  }
  if (approvalUrl) return { outcome: "approval_required", approvalUrl };
  await repository.recordPlanChange(env, tenantId, subscription, {
    plan: target.plan,
    interval: target.interval,
    providerPlanId,
    // Dodo charged for the new plan now; PayPal reports and bills it from the next cycle.
    entitledPlan: target.plan,
    entitledUntil: subscription.provider === "paypal" ? periodEnd : null,
    pending: null,
  });
  return { outcome: "applied", approvalUrl: null };
}

/** Stops the renewal of the live subscription for one purpose; it runs to the period's end. */
export async function cancelSubscription(
  repository: BillingRepository,
  env: Bindings,
  tenantId: string,
  familyTenantId: string | null,
): Promise<void> {
  const subscription = await repository.getProviderSubscription(env, tenantId, familyTenantId);
  if (!subscription || subscription.cancelAtPeriodEnd || subscription.status === "canceled") {
    throw new HttpError(
      409,
      "subscription_not_cancelable",
      "There is no active subscription to cancel.",
    );
  }
  await cancelProviderSubscription(env, subscription);
}

export async function cancelProviderSubscription(
  env: Bindings,
  subscription: Pick<BillingProviderSubscription, "provider" | "providerSubscriptionId">,
): Promise<void> {
  if (subscription.provider === "dodo") {
    await cancelDodoSubscription(env, subscription.providerSubscriptionId);
  } else {
    await cancelPayPalSubscription(env, subscription.providerSubscriptionId);
  }
}
