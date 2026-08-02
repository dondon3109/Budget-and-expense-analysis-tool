import { billingCheckoutRequestSchema, type BillingCheckoutReconciliation } from "@zoption/shared";
import { Hono } from "hono";

import {
  cancelPayPalSubscription,
  createPayPalSubscription,
  getPayPalSubscription,
  isPayPalCheckoutPending,
  normalizePayPalSubscriptionStatus,
} from "../billing/paypal";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment, Bindings } from "../types";

async function reconcileCheckout(
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

  const subscription = await getPayPalSubscription(env, checkout.providerSubscriptionId);
  if (
    subscription.id !== checkout.providerSubscriptionId ||
    subscription.planId !== checkout.providerPlanId ||
    subscription.customId !== checkout.reference
  ) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned invalid checkout details.",
    );
  }

  if (isPayPalCheckoutPending(subscription.status)) {
    return { outcome: "pending", summary: await repository.getSummary(env, tenantId) };
  }

  const status = normalizePayPalSubscriptionStatus(subscription.status);
  if (!status || !subscription.statusUpdatedAt) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider returned an incomplete subscription status.",
    );
  }
  if (status === "canceled") {
    await repository.supersedePendingCheckout(env, tenantId, checkout.reference);
    return { outcome: "closed", summary: await repository.getSummary(env, tenantId) };
  }
  if (
    status === "active" &&
    (!subscription.currentPeriodEndsAt ||
      new Date(subscription.currentPeriodEndsAt).getTime() <= Date.now())
  ) {
    throw new HttpError(
      502,
      "billing_provider_error",
      "The billing provider has not confirmed the paid period yet.",
    );
  }

  await repository.applySubscriptionSnapshot(env, {
    provider: "paypal",
    providerUpdateId: `reconcile:${subscription.id}:${subscription.statusUpdatedAt}:${subscription.status}`,
    occurredAt: subscription.statusUpdatedAt,
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
  });

  return { outcome: "confirmed", summary: await repository.getSummary(env, tenantId) };
}

export function createBillingRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.getSummary(context.env, context.get("tenant").tenantId)),
  );

  routes.post("/reconcile", async (context) =>
    context.json(await reconcileCheckout(repository, context.env, context.get("tenant").tenantId)),
  );

  routes.post("/checkout", async (context) => {
    const parsed = billingCheckoutRequestSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid billing interval.");
    }
    const tenantId = context.get("tenant").tenantId;
    const checkout = await repository.createCheckoutReference(
      context.env,
      tenantId,
      parsed.data.interval,
    );
    if (checkout.provider !== "paypal") {
      throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
    }

    const subscription = checkout.providerSubscriptionId
      ? await getPayPalSubscription(context.env, checkout.providerSubscriptionId)
      : await createPayPalSubscription(context.env, {
          planId: checkout.providerPlanId,
          checkoutReference: checkout.reference,
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
        context.env,
        tenantId,
        checkout.reference,
        "paypal",
        subscription.id,
      );
    }
    if (!subscription.approvalUrl) {
      const reconciliation = await reconcileCheckout(repository, context.env, tenantId);
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
    return context.json({ approvalUrl: subscription.approvalUrl }, 201);
  });

  routes.post("/cancel", async (context) => {
    const subscription = await repository.getProviderSubscription(
      context.env,
      context.get("tenant").tenantId,
      "paypal",
    );
    if (!subscription || subscription.cancelAtPeriodEnd || subscription.status === "canceled") {
      throw new HttpError(
        409,
        "subscription_not_cancelable",
        "There is no active subscription to cancel.",
      );
    }
    await cancelPayPalSubscription(context.env, subscription.providerSubscriptionId);
    return context.json({ cancellationRequested: true });
  });

  return routes;
}
