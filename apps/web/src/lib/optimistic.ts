import type { QueryClient, QueryKey, Updater } from "@tanstack/react-query";

export interface OptimisticCacheSnapshot {
  entries: Array<[QueryKey, unknown]>;
}

/**
 * Pauses matching refetches, snapshots their cache entries, and applies an
 * immediate immutable update. Restore the returned snapshot when the request
 * fails, then invalidate after settlement to reconcile with server truth.
 */
export async function updateOptimistically<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: Updater<TData | undefined, TData | undefined>,
  exact = true,
): Promise<OptimisticCacheSnapshot> {
  await queryClient.cancelQueries({ queryKey, exact });
  const entries = queryClient.getQueriesData({ queryKey, exact });
  queryClient.setQueriesData<TData>({ queryKey, exact }, updater);
  return { entries };
}

export function restoreOptimisticSnapshot(
  queryClient: QueryClient,
  snapshot?: OptimisticCacheSnapshot,
): void {
  for (const [queryKey, data] of snapshot?.entries ?? []) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function optimisticId(resource: string): string {
  return `optimistic:${resource}:${crypto.randomUUID()}`;
}
