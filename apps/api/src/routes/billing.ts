import {
  billingCheckoutRequestSchema,
  billingPlanChangeRequestSchema,
  isFamilyPlan,
} from "@zoption/shared";
import { Hono } from "hono";

import { cancelSubscription, changePlan, startCheckout } from "../billing/checkout";
import { getPayPalBrowserConfiguration } from "../billing/paypal";
import { reconcileBillingCheckout } from "../billing/reconciliation";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { parseInput, readJson } from "../request";
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
      await reconcileBillingCheckout(repository, context.env, context.get("tenant").tenantId, {
        abortPendingCheckout,
      }),
    );
  });

  routes.post("/checkout", async (context) => {
    const parsed = billingCheckoutRequestSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid plan and billing interval.");
    }
    const response = await startCheckout(repository, context.env, context.get("tenant").tenantId, {
      ...parsed.data,
      familyTenantId: null,
    });
    return context.json(response, 201);
  });

  routes.post("/change", async (context) => {
    const request = parseInput(
      billingPlanChangeRequestSchema,
      await readJson(context),
      "Choose a valid plan and billing interval.",
    );
    if (isFamilyPlan(request.plan)) {
      throw new HttpError(400, "invalid_request", "Manage a family plan from Family settings.");
    }
    return context.json(
      await changePlan(repository, context.env, context.get("tenant").tenantId, null, request),
    );
  });

  routes.post("/cancel", async (context) => {
    await cancelSubscription(repository, context.env, context.get("tenant").tenantId, null);
    return context.json({ cancellationRequested: true });
  });

  return routes;
}
