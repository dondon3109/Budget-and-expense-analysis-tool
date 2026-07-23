import { transactionExportQuerySchema } from "@zoption/shared";
import { Hono } from "hono";

import type { TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import { buildTransactionCsv } from "../exports/csv";
import type { AppEnvironment } from "../types";

export function createExportRoutes(repository: TransactionRepository) {
  const routes = new Hono<AppEnvironment>();

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
    const rows = await repository.export(context.env, context.get("tenant").tenantId, parsed.data);
    context.header("Content-Type", "text/csv; charset=utf-8");
    context.header("Content-Disposition", 'attachment; filename="zoption-transactions.csv"');
    return context.body(buildTransactionCsv(rows));
  });

  return routes;
}
