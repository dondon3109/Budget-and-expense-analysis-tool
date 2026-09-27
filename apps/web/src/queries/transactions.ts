import type { TransactionListQuery } from "@zoption/shared";
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getTransactionCalendar, getTransactions } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** One page of the ledger. The Transactions page's infinite feed keeps its own options. */
export function transactionsQueryOptions(
  workspace: AuthenticatedWorkspace,
  query: TransactionListQuery,
) {
  return queryOptions({
    queryKey: queryKeys.transactions(workspace, query),
    queryFn: () => getTransactions(workspace, query),
  });
}

/** `month` is the first day of the month, `YYYY-MM-01`. */
export function transactionCalendarQueryOptions(workspace: AuthenticatedWorkspace, month: string) {
  return queryOptions({
    queryKey: queryKeys.transactionCalendar(workspace, month),
    queryFn: () => getTransactionCalendar(workspace, month),
  });
}

/** A saved, deleted, or restored transaction moves the ledger, balances, dashboard, and debts. */
export function invalidateAfterTransactionWrite(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
    // A saved debt payment moves the linked debt's balance, so the planning page reads it fresh.
    queryClient.invalidateQueries({ queryKey: queryKeys.debts(workspace) }),
  ]);
}
