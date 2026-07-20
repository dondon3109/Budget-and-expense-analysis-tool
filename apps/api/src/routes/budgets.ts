import { budgetQuerySchema, budgetUpsertSchema } from "@budget/shared";
import { Hono } from "hono";

import type { BudgetRepository } from "../db/budgets";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

export function createBudgetRoutes(repository: BudgetRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const parsed = budgetQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid budget month.");
    }
    return context.json(
      await repository.list(context.env, context.get("tenant").tenantId, parsed.data.month),
    );
  });

  routes.put("/", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = budgetUpsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the monthly budget values.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.upsert(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  return routes;
}
