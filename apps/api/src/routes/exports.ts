import { transactionExportQuerySchema } from "@budget/shared";
import { Hono } from "hono";

import type { TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import { buildTransactionCsv } from "../exports/csv";
import type { Bindings } from "../types";

export function createExportRoutes(repository: TransactionRepository) {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/transactions.csv", async (context) => {
    const parsed = transactionExportQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the export filters.",
        parsed.error.flatten(),
      );
    }
    const rows = await repository.export(context.env, parsed.data);
    context.header("Content-Type", "text/csv; charset=utf-8");
    context.header("Content-Disposition", 'attachment; filename="clarity-transactions.csv"');
    context.header("Cache-Control", "no-store");
    return context.body(buildTransactionCsv(rows));
  });

  return routes;
}
