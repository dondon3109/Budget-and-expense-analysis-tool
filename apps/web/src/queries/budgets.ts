import { queryOptions, useQuery } from "@tanstack/react-query";

import { getBudgets } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** `month` is the first day of the month, `YYYY-MM-01`. */
export function budgetsQueryOptions(workspace: AuthenticatedWorkspace, month: string) {
  return queryOptions({
    queryKey: queryKeys.budgets(workspace, month),
    queryFn: () => getBudgets(workspace, month),
  });
}

export function useBudgets(workspace: AuthenticatedWorkspace, month: string) {
  return useQuery(budgetsQueryOptions(workspace, month));
}
