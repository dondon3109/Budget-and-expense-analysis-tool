import type { BudgetMonthPlan, BudgetUpsert } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getBudgets(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<BudgetMonthPlan> {
  return requestJson(workspace, `/api/app/budgets?month=${encodeURIComponent(month)}`);
}

export function saveBudgets(
  workspace: AuthenticatedWorkspace,
  input: BudgetUpsert,
): Promise<BudgetMonthPlan> {
  return requestJson(workspace, "/api/app/budgets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
