import { queryOptions, useQuery } from "@tanstack/react-query";

import { getDebts } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function debtsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.debts(workspace),
    queryFn: () => getDebts(workspace),
    // Debts are personal only; the API refuses them in a family workspace.
    enabled: !workspace.familyId,
  });
}

export function useDebts(workspace: AuthenticatedWorkspace) {
  return useQuery(debtsQueryOptions(workspace));
}
