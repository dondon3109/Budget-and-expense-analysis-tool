import type { MobileSyncChange } from "@zoption/shared";

/**
 * The local SQLite table that holds each synchronized entity, read by sync apply and by the
 * mutation commands. A transfer has no entry: it is two rows in `transactions`.
 */
// Remittances sync only in a family workspace, which this app does not sync yet.
type LocalSyncEntity = Exclude<MobileSyncChange["entityType"], "remittance">;

export const SYNC_ENTITY_TABLES = {
  account: "accounts",
  category: "categories",
  transaction: "transactions",
  budget: "budgets",
  goal: "financial_goals",
  debt: "debts",
  subscription: "subscriptions",
  event: "calendar_events",
} as const satisfies Record<LocalSyncEntity, string>;

/** The table for a pulled change; a remittance cannot arrive without the family feature. */
export function syncChangeTable(entityType: MobileSyncChange["entityType"]): string {
  if (entityType === "remittance") throw new Error("This app does not sync remittances.");
  return SYNC_ENTITY_TABLES[entityType];
}
