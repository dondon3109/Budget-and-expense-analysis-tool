import { transactionExportQuerySchema } from "@zoption/shared";
import { Hono } from "hono";

import type { BillingRepository } from "../db/billing";
import type { TransactionRepository } from "../db/transactions";
import { HttpError } from "../errors";
import { buildAccountArchive } from "../exports/archive";
import { buildTransactionCsv } from "../exports/csv";
import type { AppEnvironment } from "../types";

export function createExportRoutes(
  repository: TransactionRepository,
  billing: Pick<BillingRepository, "requirePro">,
) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/account-archive.json", async (context) => {
    const authUser = context.get("authUser");
    const tenant = context.get("tenant");
    const archive = await buildAccountArchive({
      env: context.env,
      tenantId: tenant.tenantId,
      user: { id: authUser.id, email: authUser.email ?? "" },
      transactionRepository: repository,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    context.header("Content-Type", "application/json; charset=utf-8");
    context.header(
      "Content-Disposition",
      `attachment; filename="zoption-account-archive-${dateStr}.json"`,
    );
    return context.body(JSON.stringify(archive, null, 2));
  });

  routes.get("/transactions.csv", async (context) => {
    await billing.requirePro(context.env, context.get("tenant").tenantId, "transaction_export");
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
