import type { CashflowTrend, DashboardSummary, TransferFeeInsight } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getDashboard(
  workspace: AuthenticatedWorkspace,
  period: { from: string; to: string },
): Promise<DashboardSummary> {
  return requestJson(workspace, `/api/app/dashboard?${new URLSearchParams(period).toString()}`);
}

export function getCashflowTrend(
  workspace: AuthenticatedWorkspace,
  query: { view: CashflowTrend["view"]; anchorDate: string },
): Promise<CashflowTrend> {
  return requestJson(
    workspace,
    `/api/app/dashboard/cashflow-trend?${new URLSearchParams(query).toString()}`,
  );
}

export function getTransferFeeInsight(
  workspace: AuthenticatedWorkspace,
): Promise<TransferFeeInsight> {
  return requestJson(workspace, "/api/app/dashboard/transfer-fees");
}
