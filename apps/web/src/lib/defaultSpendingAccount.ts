import { useSyncExternalStore } from "react";

/**
 * The account a new transaction starts on. It is a per-browser preference, like the
 * voice language: it never reaches the server, so the offline mobile sync contract is
 * untouched and each device keeps its own choice.
 */
export const DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY = "zoption-default-spending-account";

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Null clears the choice, so new entries fall back to cash and then the first account. */
export function setDefaultSpendingAccountId(accountId: string | null): void {
  try {
    if (accountId) window.localStorage.setItem(DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY, accountId);
    else window.localStorage.removeItem(DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY);
  } catch {
    // Private browsing or a full quota: the choice is not saved and new entries keep the fallback.
  }
  for (const listener of listeners) listener();
}

export function useDefaultSpendingAccountId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
