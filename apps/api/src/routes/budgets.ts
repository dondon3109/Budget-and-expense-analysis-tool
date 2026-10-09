import { budgetOccasionsQuerySchema, budgetQuerySchema, budgetUpsertSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { BudgetRepository } from "../db/budgets";
import { HttpError } from "../errors";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createBudgetRoutes(repository: BudgetRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    // A plain `?month=` read stays a month plan, as clients before budget scopes send it.
    const query = context.req.query();
    const parsed = budgetQuerySchema.safeParse(
      query.scope === undefined ? { scope: "month", ...query } : query,
    );
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid budget month or occasion.");
    }
    return context.json(
      await repository.get(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.get("/occasions", async (context) => {
    const parsed = budgetOccasionsQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose a valid budget month.");
    }
    return context.json({
      occasions: await repository.listOccasions(
        context.env,
        context.get("tenant").tenantId,
        parsed.data.month,
      ),
    });
  });

  routes.put("/", async (context) => {
    const body = await readJson(context);
    // A body without `scope` is a month plan, as clients before budget scopes send it.
    const input = parseInput(
      budgetUpsertSchema,
      typeof body === "object" && body !== null ? { scope: "month", ...body } : body,
      "Check the budget values.",
    );
    return context.json(
      await repository.upsert(context.env, context.get("tenant").tenantId, input),
    );
  });

  return routes;
}
