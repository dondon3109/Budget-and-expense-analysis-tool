import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";

import { getAccounts } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function accountsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
  });
}

export function useAccounts(workspace: AuthenticatedWorkspace) {
  return useQuery(accountsQueryOptions(workspace));
}

/** An account write or balance adjustment moves balances on the ledger and the dashboard. */
export function invalidateAfterAccountWrite(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
  ]);
}
