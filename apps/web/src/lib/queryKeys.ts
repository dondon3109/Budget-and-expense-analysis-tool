import type { TransactionListQuery } from "@budget/shared";

import type { Workspace } from "./workspace";

export const queryKeys = {
  workspace: (workspace: Workspace) => ["workspace", workspace.key] as const,
  dashboard: (workspace: Workspace) =>
    [...queryKeys.workspace(workspace), "dashboard", "2026-07"] as const,
  transactions: (workspace: Workspace, query: TransactionListQuery) =>
    [...queryKeys.workspace(workspace), "transactions", query] as const,
  allTransactions: (workspace: Workspace) =>
    [...queryKeys.workspace(workspace), "transactions"] as const,
  categories: (workspace: Workspace, includeArchived = false) =>
    [...queryKeys.workspace(workspace), "categories", { includeArchived }] as const,
  allCategories: (workspace: Workspace) =>
    [...queryKeys.workspace(workspace), "categories"] as const,
  accounts: (workspace: Workspace) => [...queryKeys.workspace(workspace), "accounts"] as const,
  budgets: (workspace: Workspace, month: string) =>
    [...queryKeys.workspace(workspace), "budgets", month] as const,
};
