import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getBillingSummary } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const RESET_REFETCH_DELAY_MS = 1_000;

export function billingSummaryQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.billing(workspace),
    queryFn: () => getBillingSummary(workspace),
  });
}

/** Refreshes plan usage after an action that may have consumed a metered allowance. */
export function invalidateBillingSummary(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) });
}

/** The billing summary, refetched once the earliest usage allowance resets. */
export function useBillingSummary(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  const query = useQuery(billingSummaryQueryOptions(workspace));
  const nextResetAt = query.data?.usages
    .map((usage) => usage.resetsAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && value > Date.now())
    .sort((left, right) => left - right)[0];

  useEffect(() => {
    if (nextResetAt === undefined) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const remaining = nextResetAt + RESET_REFETCH_DELAY_MS - Date.now();
      if (remaining <= 0) {
        void invalidateBillingSummary(queryClient, workspace);
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nextResetAt, queryClient, workspace]);

  return query;
}
