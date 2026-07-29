import type { TransactionListQuery } from "@zoption/shared";

export const TRANSACTION_SORT_STORAGE_KEY = "zoption-transaction-sort";

export type TransactionSortPreference = Pick<TransactionListQuery, "sortBy" | "sortDirection">;

export const DEFAULT_TRANSACTION_SORT: TransactionSortPreference = {
  sortBy: "date",
  sortDirection: "desc",
};

function isTransactionSortPreference(value: unknown): value is TransactionSortPreference {
  if (!value || typeof value !== "object") return false;

  const preference = value as Record<string, unknown>;
  return (
    (preference.sortBy === "date" ||
      preference.sortBy === "description" ||
      preference.sortBy === "amount") &&
    (preference.sortDirection === "asc" || preference.sortDirection === "desc")
  );
}

export function parseTransactionSortPreference(
  value: string | null,
): TransactionSortPreference | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isTransactionSortPreference(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readTransactionSortPreference(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): TransactionSortPreference {
  try {
    return (
      parseTransactionSortPreference(storage.getItem(TRANSACTION_SORT_STORAGE_KEY)) ?? {
        ...DEFAULT_TRANSACTION_SORT,
      }
    );
  } catch {
    return { ...DEFAULT_TRANSACTION_SORT };
  }
}

export function persistTransactionSortPreference(
  preference: TransactionSortPreference,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): boolean {
  try {
    storage.setItem(TRANSACTION_SORT_STORAGE_KEY, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
