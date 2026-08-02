import type { TransactionListQuery } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "./workspace";

export const queryKeys = {
  workspace: (workspace: AuthenticatedWorkspace) => ["workspace", workspace.key] as const,
  billing: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "billing"] as const,
  sponsoredProSeats: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "sponsored-pro-seats"] as const,
  dashboard: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "dashboard"] as const,
  dashboardSummary: (workspace: AuthenticatedWorkspace, period: { from: string; to: string }) =>
    [...queryKeys.dashboard(workspace), "summary", period] as const,
  cashflowTrend: (
    workspace: AuthenticatedWorkspace,
    query: { view: "weekly" | "monthly" | "sixMonth"; anchorDate: string },
  ) => [...queryKeys.dashboard(workspace), "cashflow-trend", query] as const,
  transactions: (workspace: AuthenticatedWorkspace, query: TransactionListQuery) =>
    [...queryKeys.workspace(workspace), "transactions", query] as const,
  allTransactions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "transactions"] as const,
  transactionCalendar: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.allTransactions(workspace), "calendar", month] as const,
  allEvents: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "events"] as const,
  events: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.allEvents(workspace), month] as const,
  categories: (workspace: AuthenticatedWorkspace, includeArchived = false) =>
    [...queryKeys.workspace(workspace), "categories", { includeArchived }] as const,
  allCategories: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "categories"] as const,
  accounts: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "accounts"] as const,
  assistantPreferences: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "preferences"] as const,
  assistantThreads: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "threads"] as const,
  assistantMessages: (workspace: AuthenticatedWorkspace, threadId: string) =>
    [...queryKeys.workspace(workspace), "assistant", "threads", threadId, "messages"] as const,
  budgets: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.workspace(workspace), "budgets", month] as const,
  financialGoals: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "financial-goals"] as const,
  debts: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "debts"] as const,
  subscriptions: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.workspace(workspace), "subscriptions", month] as const,
  allSubscriptions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "subscriptions"] as const,
};
