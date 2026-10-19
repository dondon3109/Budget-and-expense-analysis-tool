import {
  billingPlanChangeRequestSchema,
  familyBillingCheckoutRequestSchema,
  isFamilyPlan,
} from "@zoption/shared";
import { Hono, type Context } from "hono";

import {
  cancelSubscription,
  changePlan,
  familyPlanPayer,
  startCheckout,
} from "../billing/checkout";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * The plan of the family the workspace header names, under `/api/app/family/billing`, owner only.
 * The owner pays from their personal workspace, so the subscription and its checkout live there;
 * the client confirms a checkout through the personal `/api/app/billing/reconcile`.
 */
export function createFamilyBillingRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  const ownerContext = (context: Context<AppEnvironment>) =>
    familyPlanPayer(context.get("tenant"), context.get("authUser"));

  routes.get("/", async (context) => {
    const { familyTenantId, payerTenantId } = ownerContext(context);
    return context.json(
      await repository.getFamilySummary(context.env, familyTenantId, payerTenantId),
    );
  });

  routes.post("/checkout", async (context) => {
    const { familyTenantId, payerTenantId } = ownerContext(context);
    const request = parseInput(
      familyBillingCheckoutRequestSchema,
      await readJson(context),
      "Choose a family plan and billing interval.",
    );
    const response = await startCheckout(repository, context.env, payerTenantId, {
      ...request,
      familyTenantId,
    });
    return context.json(response, 201);
  });

  routes.post("/change", async (context) => {
    const { familyTenantId, payerTenantId } = ownerContext(context);
    const request = parseInput(
      billingPlanChangeRequestSchema,
      await readJson(context),
      "Choose a family plan and billing interval.",
    );
    if (!isFamilyPlan(request.plan)) {
      throw new HttpError(400, "invalid_request", "Choose a family plan.");
    }
    return context.json(
      await changePlan(repository, context.env, payerTenantId, familyTenantId, request),
    );
  });

  routes.post("/cancel", async (context) => {
    const { familyTenantId, payerTenantId } = ownerContext(context);
    await cancelSubscription(repository, context.env, payerTenantId, familyTenantId);
    return context.json({ cancellationRequested: true });
  });

  return routes;
}
