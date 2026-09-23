import {
  transactionCalendarQuerySchema,
  transactionInputSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { TransactionRepository } from "../db/transactions";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createTransactionRoutes(repository: TransactionRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/calendar", async (context) => {
    const input = parseInput(
      transactionCalendarQuerySchema,
      context.req.query(),
      "Choose a valid calendar month.",
    );
    return context.json(
      await repository.calendar(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.get("/", async (context) => {
    const input = parseInput(
      transactionListQuerySchema,
      context.req.query(),
      "Check the transaction filters.",
    );
    return context.json(await repository.list(context.env, context.get("tenant").tenantId, input));
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
    const input = parseInput(transactionInputSchema, body, "Check the transaction fields.");
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, input),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const body = await readJson(context);
    const input = parseInput(transactionUpdateSchema, body, "Check the transaction fields.");
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
