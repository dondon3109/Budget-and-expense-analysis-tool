import type { TransactionListQuery } from "@budget/shared";

export const queryKeys = {
  dashboard: ["dashboard", "2026-07"] as const,
  transactions: (query: TransactionListQuery) => ["transactions", query] as const,
  allTransactions: ["transactions"] as const,
  categories: (includeArchived = false) => ["categories", { includeArchived }] as const,
  accounts: ["accounts"] as const,
  budgets: (month: string) => ["budgets", month] as const,
};
