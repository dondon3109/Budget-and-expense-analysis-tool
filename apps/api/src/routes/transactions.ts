import {
  transactionInputSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from "@budget/shared";
import { Hono } from "hono";

import type { TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export function createTransactionRoutes(repository: TransactionRepository) {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (context) => {
    const parsed = transactionListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the transaction filters.",
        parsed.error.flatten(),
      );
    }
    return context.json(await repository.list(context.env, parsed.data));
  });

  routes.post("/", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = transactionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the transaction fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(await repository.create(context.env, parsed.data), 201);
  });

  routes.patch("/:id", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = transactionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the transaction fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(await repository.update(context.env, context.req.param("id"), parsed.data));
  });

  routes.delete("/:id", async (context) => {
    await repository.remove(context.env, context.req.param("id"));
    return context.body(null, 204);
  });

  return routes;
}
