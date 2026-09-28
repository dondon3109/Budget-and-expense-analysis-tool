import { queryOptions, useQuery } from "@tanstack/react-query";

import { getSubscriptions } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** `month` is the first day of the month, `YYYY-MM-01`. */
export function subscriptionsQueryOptions(workspace: AuthenticatedWorkspace, month: string) {
  return queryOptions({
    queryKey: queryKeys.subscriptions(workspace, month),
    queryFn: () => getSubscriptions(workspace, month),
  });
}

export function useSubscriptions(workspace: AuthenticatedWorkspace, month: string) {
  return useQuery(subscriptionsQueryOptions(workspace, month));
}
