import type {
  TransactionCalendarMonth,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
  TransactionUpdate,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getTransactions(
  workspace: AuthenticatedWorkspace,
  query: TransactionListQuery,
): Promise<TransactionPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return requestJson(workspace, `/api/app/transactions?${search.toString()}`);
}

export function getTransactionCalendar(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<TransactionCalendarMonth> {
  return requestJson(
    workspace,
    `/api/app/transactions/calendar?month=${encodeURIComponent(month)}`,
  );
}

export function createTransaction(
  workspace: AuthenticatedWorkspace,
  input: TransactionInput,
): Promise<TransactionListItem> {
  return requestJson(workspace, "/api/app/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTransaction(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: TransactionUpdate },
): Promise<TransactionListItem> {
  return requestJson(workspace, `/api/app/transactions/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteTransaction(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/transactions/${id}`, { method: "DELETE" });
}
