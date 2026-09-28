import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";

import { getCategories } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function categoriesQueryOptions(workspace: AuthenticatedWorkspace, includeArchived = false) {
  return queryOptions({
    queryKey: queryKeys.categories(workspace, includeArchived),
    queryFn: () => getCategories(workspace, includeArchived),
  });
}

export function useCategories(workspace: AuthenticatedWorkspace, includeArchived = false) {
  return useQuery(categoriesQueryOptions(workspace, includeArchived));
}

/** Custom categories count toward a plan limit, so the billing summary refreshes with them. */
export function invalidateCategoriesAndBilling(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allCategories(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) }),
  ]);
}
