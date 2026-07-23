import {
  subscriptionInputSchema,
  subscriptionQuerySchema,
  subscriptionStatusUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { SubscriptionRepository } from "../db/subscriptions";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

export function createSubscriptionRoutes(repository: SubscriptionRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const parsed = subscriptionQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid subscription month.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.list(context.env, context.get("tenant").tenantId, parsed.data.month),
    );
  });

  routes.post("/", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = subscriptionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the subscription fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  routes.patch("/:id/status", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = subscriptionStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid subscription status.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.setStatus(
        context.env,
        context.get("tenant").tenantId,
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  return routes;
}
