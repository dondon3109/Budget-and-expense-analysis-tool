import { queryOptions, useQuery } from "@tanstack/react-query";

import { getSubscriptions, getSubscriptionUsage } from "../lib/api";
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

/** Pro only: pass `enabled: false` on other plans so the page never asks for a 403. */
export function useSubscriptionUsage(workspace: AuthenticatedWorkspace, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.subscriptionUsage(workspace),
    queryFn: () => getSubscriptionUsage(workspace),
    enabled,
  });
}
