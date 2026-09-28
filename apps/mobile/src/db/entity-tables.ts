import type { MobileSyncChange } from "@zoption/shared";

/**
 * The local SQLite table that holds each synchronized entity, read by sync apply and by the
 * mutation commands. A transfer has no entry: it is two rows in `transactions`.
 */
export const SYNC_ENTITY_TABLES = {
  account: "accounts",
  category: "categories",
  transaction: "transactions",
  budget: "budgets",
  goal: "financial_goals",
  debt: "debts",
  subscription: "subscriptions",
  event: "calendar_events",
} as const satisfies Record<MobileSyncChange["entityType"], string>;
