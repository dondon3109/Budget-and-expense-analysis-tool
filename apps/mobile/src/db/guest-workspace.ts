import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Subject of the on-device workspace used without an account. It can never equal a Supabase user
 * id, so the subject-scoped workspace, key, and metadata checks keep it apart from every account.
 */
export const GUEST_SUBJECT = "zoption-guest";

export function isGuestSubject(subject: string | null | undefined): boolean {
  return subject === GUEST_SUBJECT;
}

// The Worker seeds these for every new account. A guest workspace never pulls, so it starts with
// the same starting set locally, already settled so the editors treat the rows as ordinary.
const GUEST_ACCOUNTS = [
  { id: "guest-account-cash", name: "Cash", type: "cash" },
  { id: "guest-account-bank", name: "Bank", type: "checking" },
  { id: "guest-account-gcash", name: "GCash", type: "other" },
] as const;

const GUEST_CATEGORIES = [
  { id: "guest-category-salary", name: "Salary", kind: "income", color: "#2a78d6", emoji: "💼" },
  { id: "guest-category-housing", name: "Housing", kind: "expense", color: "#008300", emoji: "🏠" },
  {
    id: "guest-category-food",
    name: "Food & dining",
    kind: "expense",
    color: "#e87ba4",
    emoji: "🍔",
  },
  {
    id: "guest-category-transport",
    name: "Transport",
    kind: "expense",
    color: "#eda100",
    emoji: "🚗",
  },
  {
    id: "guest-category-utilities",
    name: "Utilities",
    kind: "expense",
    color: "#1baf7a",
    emoji: "💡",
  },
  { id: "guest-category-leisure", name: "Leisure", kind: "expense", color: "#eb6834", emoji: "🎁" },
  {
    id: "guest-category-savings",
    name: "Savings transfer",
    kind: "transfer",
    color: "#4a3aa7",
    emoji: "💰",
  },
] as const;

/** Gives an empty guest workspace the starter accounts and categories. */
export async function seedGuestWorkspace(database: SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    for (const account of GUEST_ACCOUNTS) {
      await database.runAsync(
        `INSERT OR IGNORE INTO accounts (
          id, name, type, currency, archived, system, server_revision, sync_state
        ) VALUES (?, ?, ?, 'PHP', 0, 1, 1, 'synced')`,
        account.id,
        account.name,
        account.type,
      );
    }
    for (const category of GUEST_CATEGORIES) {
      await database.runAsync(
        `INSERT OR IGNORE INTO categories (
          id, name, kind, color, icon_emoji, archived, system, origin, required_plan, locked,
          server_revision, sync_state
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 'starter', 'free', 0, 1, 'synced')`,
        category.id,
        category.name,
        category.kind,
        category.color,
        category.emoji,
      );
    }
  });
}
