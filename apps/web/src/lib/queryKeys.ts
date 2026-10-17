import type { TransactionListQuery } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "./workspace";

export const queryKeys = {
  /** Placeholder for a query that stays disabled until a workspace exists. */
  withoutWorkspace: <Scope extends string>(scope: Scope) => [scope] as const,
  workspace: (workspace: AuthenticatedWorkspace) => ["workspace", workspace.key] as const,
  billing: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "billing"] as const,
  sponsoredProSeats: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "sponsored-pro-seats"] as const,
  bugReports: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "bug-reports"] as const,
  adminBugReports: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "admin", "bug-reports"] as const,
  allAdminCustomerReviews: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "admin", "customer-reviews"] as const,
  adminCustomerReviews: (
    workspace: AuthenticatedWorkspace,
    query?: { page: number; status?: string; rating?: number; search?: string },
  ) => [...queryKeys.allAdminCustomerReviews(workspace), query] as const,
  pet: (workspace: AuthenticatedWorkspace) => [...queryKeys.workspace(workspace), "pet"] as const,
  dashboard: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "dashboard"] as const,
  allDashboardSummaries: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.dashboard(workspace), "summary"] as const,
  dashboardSummary: (workspace: AuthenticatedWorkspace, period: { from: string; to: string }) =>
    [...queryKeys.allDashboardSummaries(workspace), period] as const,
  cashflowTrend: (
    workspace: AuthenticatedWorkspace,
    query: { view: "weekly" | "monthly" | "sixMonth"; anchorDate: string },
  ) => [...queryKeys.dashboard(workspace), "cashflow-trend", query] as const,
  transferFeeInsight: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.dashboard(workspace), "transfer-fees"] as const,
  transactions: (workspace: AuthenticatedWorkspace, query: TransactionListQuery) =>
    [...queryKeys.workspace(workspace), "transactions", query] as const,
  allTransactions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "transactions"] as const,
  transactionTotal: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.allTransactions(workspace), "total"] as const,
  /** The Transactions page's infinite ledger; its cache holds pages, not a single page. */
  transactionFeed: (workspace: AuthenticatedWorkspace, query: TransactionListQuery) =>
    [...queryKeys.allTransactions(workspace), "feed", query] as const,
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
  shareLinks: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "share-links"] as const,
  assistantPreferences: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "preferences"] as const,
  assistantThreads: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "threads"] as const,
  assistantMessages: (workspace: AuthenticatedWorkspace, threadId: string) =>
    [...queryKeys.workspace(workspace), "assistant", "threads", threadId, "messages"] as const,
  assistantMemory: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "memory"] as const,
  assistantMemoryPreferences: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "assistant", "memory", "preferences"] as const,
  receiptPreferences: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "receipts", "preferences"] as const,
  workspaceSettings: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "settings"] as const,
  onboarding: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "onboarding"] as const,
  goalProfile: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "goal-profile"] as const,
  /** Every plan, for invalidating after a write. */
  allBudgets: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "budgets"] as const,
  /** `plan` is a month start, "every-month", or `occasion:<id>`. */
  budgets: (workspace: AuthenticatedWorkspace, plan: string) =>
    [...queryKeys.allBudgets(workspace), plan] as const,
  budgetOccasions: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.allBudgets(workspace), "occasions", month] as const,
  financialGoals: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "financial-goals"] as const,
  debts: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "debts"] as const,
  subscriptions: (workspace: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.workspace(workspace), "subscriptions", month] as const,
  allSubscriptions: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "subscriptions"] as const,
  providerConfigs: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "admin", "provider-configs"] as const,
  providerHealth: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.providerConfigs(workspace), "health"] as const,
  providerConfigAudits: (workspace: AuthenticatedWorkspace, service?: string) =>
    [...queryKeys.workspace(workspace), "admin", "provider-config-audits", service] as const,
  providerCredentials: (workspace: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(workspace), "admin", "provider-credentials"] as const,
  /** Personal workspace only: the workspaces this person can switch between. */
  workspaces: (personal: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(personal), "workspaces"] as const,
  /** Personal workspace only: invitations addressed to this person. */
  familyInvitations: (personal: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(personal), "family-invitations"] as const,
  /** A family workspace: its members, invitations, and seats. */
  family: (family: AuthenticatedWorkspace) => [...queryKeys.workspace(family), "family"] as const,
  /** A family workspace: the balances its members share into it. */
  familySharedBalances: (family: AuthenticatedWorkspace) =>
    [...queryKeys.family(family), "shared-balances"] as const,
  /** A family workspace: the Sent · Spent · Left card for one month, and its history. */
  familyRemittances: (family: AuthenticatedWorkspace, month: string) =>
    [...queryKeys.family(family), "remittances", month] as const,
  /** Personal workspace only: the balances this person shares into families. */
  myBalanceShares: (personal: AuthenticatedWorkspace) =>
    [...queryKeys.workspace(personal), "balance-shares"] as const,
};
