import {
  subscriptionInputSchema,
  subscriptionQuerySchema,
  subscriptionStatusUpdateSchema,
  subscriptionUpdateSchema,
  subscriptionUsageInputSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { SubscriptionUsageRepository } from "../db/subscription-usage";
import type { SubscriptionRepository } from "../db/subscriptions";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createSubscriptionRoutes(
  repository: SubscriptionRepository,
  usage: SubscriptionUsageRepository,
) {
  const routes = new Hono<AppEnvironment>();

  // Subscription ROI check-ins (Pro). Before "/:id" so "usage" is never read as an id.
  routes.get("/usage", async (context) =>
    context.json(await usage.list(context.env, context.get("tenant").tenantId)),
  );

  routes.post("/:id/usage", async (context) => {
    const input = parseInput(
      subscriptionUsageInputSchema,
      await readJson(context),
      "Choose a valid check-in date.",
    );
    return context.json(
      await usage.checkIn(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input.usedOn,
      ),
    );
  });

  routes.delete("/:id/usage/:usedOn", async (context) => {
    const input = parseInput(
      subscriptionUsageInputSchema,
      { usedOn: context.req.param("usedOn") },
      "Choose a valid check-in date.",
    );
    return context.json(
      await usage.undo(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input.usedOn,
      ),
    );
  });

  routes.get("/", async (context) => {
    const input = parseInput(
      subscriptionQuerySchema,
      context.req.query(),
      "Choose a valid subscription month.",
    );
    return context.json(
      await repository.list(context.env, context.get("tenant").tenantId, input.month),
    );
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
    const input = parseInput(subscriptionInputSchema, body, "Check the subscription fields.");
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, input),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const input = parseInput(
      subscriptionUpdateSchema,
      await readJson(context),
      "Check the subscription fields.",
    );
    return context.json(
      await repository.update(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input,
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    await repository.remove(
      context.env,
      context.get("tenant").tenantId,
      parsePathParameter(context.req.param("id")),
    );
    return context.body(null, 204);
  });

  routes.patch("/:id/status", async (context) => {
    const body = await readJson(context);
    const input = parseInput(
      subscriptionStatusUpdateSchema,
      body,
      "Choose a valid subscription status.",
    );
    return context.json(
      await repository.setStatus(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input,
      ),
    );
  });

  return routes;
}
