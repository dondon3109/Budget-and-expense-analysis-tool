import {
  cashflowTrendQuerySchema,
  dashboardQuerySchema,
  type CashflowTrend,
  type CashflowTrendQuery,
  type DashboardSummary,
  type TransferFeeInsight,
} from "@zoption/shared";
import { Hono } from "hono";

import type { BillingRepository } from "../db/billing";
import { parseInput } from "../request";
import type { AppEnvironment, Bindings } from "../types";

export type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
  accountId?: string,
) => Promise<DashboardSummary>;

export type CashflowTrendLoader = (
  env: Bindings,
  tenantId: string,
  query: CashflowTrendQuery,
) => Promise<CashflowTrend>;

export type TransferFeeLoader = (
  env: Bindings,
  tenantId: string,
  referenceDate: string,
) => Promise<TransferFeeInsight>;

export interface DashboardLoaders {
  dashboardLoader: DashboardLoader;
  cashflowTrendLoader: CashflowTrendLoader;
  transferFeeLoader: TransferFeeLoader;
}

export function createDashboardRoutes(
  { dashboardLoader, cashflowTrendLoader, transferFeeLoader }: DashboardLoaders,
  billing: Pick<BillingRepository, "requirePro">,
) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const input = parseInput(
      dashboardQuerySchema,
      context.req.query(),
      "Choose a valid dashboard date range.",
    );
    return context.json(await dashboardLoader(context.env, context.get("tenant").tenantId, input));
  });

  routes.get("/cashflow-trend", async (context) => {
    const input = parseInput(
      cashflowTrendQuerySchema,
      context.req.query(),
      "Choose a valid cashflow trend view.",
    );
    if (input.view !== "weekly") {
      await billing.requirePro(context.env, context.get("tenant").tenantId, "cashflow_analytics");
    }
    return context.json(
      await cashflowTrendLoader(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.get("/transfer-fees", async (context) => {
    const referenceDate = new Date().toISOString().slice(0, 10);
    return context.json(
      await transferFeeLoader(context.env, context.get("tenant").tenantId, referenceDate),
    );
  });

  return routes;
}
