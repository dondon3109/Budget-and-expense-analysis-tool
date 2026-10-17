import { useQuery, type QueryClient } from "@tanstack/react-query";

import { getRemittanceOverview } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** `month` is the first day of the month the card shows. */
export function useRemittanceOverview(family: AuthenticatedWorkspace, month: string) {
  return useQuery({
    queryKey: queryKeys.familyRemittances(family, month),
    queryFn: () => getRemittanceOverview(family, month),
  });
}

/**
 * A remittance that arrives adds a family income row, which moves the ledger, the dashboard,
 * and account balances, so the whole family workspace refreshes.
 */
export function invalidateAfterRemittanceWrite(
  queryClient: QueryClient,
  family: AuthenticatedWorkspace,
) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.workspace(family) });
}
