import { goalSelectionSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { GoalProfileRepository } from "../db/goal-profile";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * Not behind the onboarding gate: the goal screen runs before the workspace is finished, and
 * Account Settings changes the goal afterwards. Every call is scoped to the authenticated tenant.
 */
export function createGoalProfileRoutes(repository: GoalProfileRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.get(context.env, context.get("tenant").tenantId)),
  );

  routes.post("/shown", async (context) => {
    await repository.markShown(context.env, context.get("tenant").tenantId);
    return context.body(null, 204);
  });

  routes.put("/", async (context) => {
    const input = parseInput(goalSelectionSchema, await readJson(context), "Choose a goal.");
    return context.json(
      await repository.select(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.post("/skip", async (context) =>
    context.json(await repository.skip(context.env, context.get("tenant").tenantId)),
  );

  return routes;
}
