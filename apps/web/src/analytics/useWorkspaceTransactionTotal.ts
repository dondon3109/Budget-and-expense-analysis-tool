import { useQuery } from "@tanstack/react-query";

import { getTransactions } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/**
 * The workspace transaction total, read with a one row page of the existing
 * transactions request so a commit can tell a first import from a later one.
 * `undefined` means unknown: not requested yet, still loading, or the request
 * failed. The funnel treats an unknown total as "not the first import".
 */
export function useWorkspaceTransactionTotal(
  workspace: AuthenticatedWorkspace | undefined,
  enabled: boolean,
): number | undefined {
  const query = useQuery({
    queryKey: workspace
      ? [...queryKeys.allTransactions(workspace), "total"]
      : ["workspace-transaction-total"],
    queryFn: async () =>
      workspace
        ? (
            await getTransactions(workspace, {
              page: 1,
              pageSize: 1,
              sortBy: "date",
              sortDirection: "desc",
            })
          ).total
        : undefined,
    enabled: Boolean(workspace) && enabled,
  });

  return query.data;
}
