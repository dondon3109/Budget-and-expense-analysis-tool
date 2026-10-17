import {
  transactionCalendarQuerySchema,
  transactionInputSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { EntryAccess, TransactionRepository } from "../db/transactions";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment, TenantContext } from "../types";

/** In a family, members change only the entries they added; the owner changes any. */
function entryAccess(tenant: TenantContext, userId: string): EntryAccess | undefined {
  return tenant.membership && tenant.membership.role !== "owner"
    ? { authorOnly: userId }
    : undefined;
}

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
    const tenant = context.get("tenant");
    // Family rows record who added them; personal rows have only one person.
    const authorUserId = tenant.membership ? context.get("authUser").id : undefined;
    return context.json(
      await repository.create(context.env, tenant.tenantId, input, { authorUserId }),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const body = await readJson(context);
    const input = parseInput(transactionUpdateSchema, body, "Check the transaction fields.");
    const tenant = context.get("tenant");
    return context.json(
      await repository.update(
        context.env,
        tenant.tenantId,
        parsePathParameter(context.req.param("id")),
        input,
        entryAccess(tenant, context.get("authUser").id),
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    const tenant = context.get("tenant");
    await repository.remove(
      context.env,
      tenant.tenantId,
      parsePathParameter(context.req.param("id")),
      entryAccess(tenant, context.get("authUser").id),
    );
    return context.body(null, 204);
  });

  return routes;
}
