import type { BudgetOccasionSummary, BudgetPlan, BudgetQuery, BudgetUpsert } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

/** One plan: a month (with every-month defaults filled in), the defaults, or one occasion. */
export function getBudgets(
  workspace: AuthenticatedWorkspace,
  query: BudgetQuery,
): Promise<BudgetPlan> {
  const params = new URLSearchParams(query);
  return requestJson(workspace, `/api/app/budgets?${params.toString()}`);
}

export function getBudgetOccasions(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<{ occasions: BudgetOccasionSummary[] }> {
  return requestJson(workspace, `/api/app/budgets/occasions?month=${encodeURIComponent(month)}`);
}

export function saveBudgets(
  workspace: AuthenticatedWorkspace,
  input: BudgetUpsert,
): Promise<BudgetPlan> {
  return requestJson(workspace, "/api/app/budgets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
