import { queryOptions, useQuery } from "@tanstack/react-query";

import { getFinancialGoals } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function financialGoalsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.financialGoals(workspace),
    queryFn: () => getFinancialGoals(workspace),
  });
}

export function useFinancialGoals(workspace: AuthenticatedWorkspace) {
  return useQuery(financialGoalsQueryOptions(workspace));
}
