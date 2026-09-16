import type { QueryClient } from "@tanstack/react-query";

import { getTransactions } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/**
 * The workspace transaction total as the server reports it right now, read with a one row
 * page of the existing transactions request.
 *
 * A commit result's importedCount is compared against this value: equal means the workspace
 * held no transactions before that commit, so the import was the workspace's first one.
 * Reading after the commit avoids trusting a total that was cached while the preview was
 * open and went stale because another client added a transaction. `undefined` means the
 * read failed, and the caller must never fire the event on a guess.
 */
export async function readWorkspaceTransactionTotal(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace | undefined,
): Promise<number | undefined> {
  if (!workspace) return undefined;

  try {
    return await queryClient.fetchQuery({
      queryKey: [...queryKeys.allTransactions(workspace), "total"],
      queryFn: async () =>
        (
          await getTransactions(workspace, {
            page: 1,
            pageSize: 1,
            sortBy: "date",
            sortDirection: "desc",
          })
        ).total,
      staleTime: 0,
    });
  } catch {
    return undefined;
  }
}
