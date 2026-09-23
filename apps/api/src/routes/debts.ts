import { debtInputSchema, debtUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { DebtRepository } from "../db/debts";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createDebtRoutes(repository: DebtRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.post("/", async (context) => {
    const input = parseInput(debtInputSchema, await readJson(context), "Check the debt fields.");
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, input),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const input = parseInput(debtUpdateSchema, await readJson(context), "Check the debt fields.");
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

  return routes;
}
