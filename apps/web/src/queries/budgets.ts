import type { BudgetQuery } from "@zoption/shared";
import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";

import { getBudgetOccasions, getBudgets } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** The cache and draft key of a plan: its month start, "every-month", or `occasion:<id>`. */
export function budgetPlanKey(query: BudgetQuery): string {
  if (query.scope === "month") return query.month;
  if (query.scope === "occasion") return `occasion:${query.eventId}`;
  return "every-month";
}

export function budgetsQueryOptions(workspace: AuthenticatedWorkspace, query: BudgetQuery) {
  return queryOptions({
    queryKey: queryKeys.budgets(workspace, budgetPlanKey(query)),
    queryFn: () => getBudgets(workspace, query),
  });
}

/** `query` is null while no plan is open, such as the occasion list. */
export function useBudgets(workspace: AuthenticatedWorkspace, query: BudgetQuery | null) {
  return useQuery({
    ...budgetsQueryOptions(workspace, query ?? { scope: "every-month" }),
    enabled: query !== null,
  });
}

/** `month` is the first day of the month, `YYYY-MM-01`. */
export function budgetOccasionsQueryOptions(workspace: AuthenticatedWorkspace, month: string) {
  return queryOptions({
    queryKey: queryKeys.budgetOccasions(workspace, month),
    queryFn: async () => (await getBudgetOccasions(workspace, month)).occasions,
  });
}

export function useBudgetOccasions(workspace: AuthenticatedWorkspace, month: string) {
  return useQuery(budgetOccasionsQueryOptions(workspace, month));
}

/** A saved limit changes every month plan, the occasion list, and the dashboard that read it. */
export function invalidateAfterBudgetWrite(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allBudgets(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
  ]);
}
