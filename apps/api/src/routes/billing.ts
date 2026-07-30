import { billingCheckoutRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import { createCustomerPortalSession } from "../billing/paddle";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createBillingRoutes(repository: BillingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.getSummary(context.env, context.get("tenant").tenantId)),
  );

  routes.post("/checkout", async (context) => {
    const parsed = billingCheckoutRequestSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid billing interval.");
    }
    const reference = await repository.createCheckoutReference(
      context.env,
      context.get("tenant").tenantId,
      parsed.data.interval,
    );
    return context.json(reference, 201);
  });

  routes.post("/portal", async (context) => {
    const customer = await repository.getPortalCustomer(
      context.env,
      context.get("tenant").tenantId,
    );
    if (!customer) {
      throw new HttpError(
        409,
        "billing_customer_missing",
        "Complete a subscription checkout first.",
      );
    }
    const url = await createCustomerPortalSession(
      context.env,
      customer.customerId,
      customer.subscriptionIds,
    );
    return context.json({ url });
  });

  return routes;
}
