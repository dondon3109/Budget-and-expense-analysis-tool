import { billingCheckoutRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import {
  cancelPayPalSubscription,
  createPayPalSubscription,
  getPayPalBrowserConfiguration,
  getPayPalSubscription,
} from "../billing/paypal";
import { reconcilePayPalCheckout } from "../billing/reconciliation";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createBillingRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.getSummary(context.env, context.get("tenant").tenantId)),
  );

  routes.get("/checkout/config", (context) =>
    context.json({ provider: "paypal" as const, ...getPayPalBrowserConfiguration(context.env) }),
  );

  routes.post("/reconcile", async (context) => {
    const body = (await readJson(context).catch(() => ({}))) as {
      abortPendingCheckout?: boolean;
      checkoutCancelled?: boolean;
    };
    const abortPendingCheckout = Boolean(body.abortPendingCheckout ?? body.checkoutCancelled);
    return context.json(
      await reconcilePayPalCheckout(repository, context.env, context.get("tenant").tenantId, {
        abortPendingCheckout,
      }),
    );
  });

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
      const reconciliation = await reconcilePayPalCheckout(repository, context.env, tenantId);
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
    return context.json(
      { approvalUrl: subscription.approvalUrl, subscriptionId: subscription.id },
      201,
    );
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
