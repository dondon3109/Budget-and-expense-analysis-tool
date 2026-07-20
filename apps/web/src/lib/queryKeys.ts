import type { TransactionListQuery } from "@budget/shared";

import type { AuthenticatedWorkspace } from "./workspace";

export const queryKeys = {
  workspace: (workspace: AuthenticatedWorkspace) => ["workspace", workspace.key] as const,
  dashboard: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "dashboard", "2026-07"] as const,
  transactions: (workspace: AuthenticatedWorkspace, query: TransactionListQuery) =>
    [...queryKeys.workspace(workspace), "transactions", query] as const,
  allTransactions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "transactions"] as const,
  categories: (workspace: AuthenticatedWorkspace, includeArchived = false) =>
    [...queryKeys.workspace(workspace), "categories", { includeArchived }] as const,
  allCategories: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "categories"] as const,
  accounts: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "accounts"] as const,
  budgets: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.workspace(workspace), "budgets", month] as const,
  subscriptions: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.workspace(workspace), "subscriptions", month] as const,
  allSubscriptions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "subscriptions"] as const,
};
