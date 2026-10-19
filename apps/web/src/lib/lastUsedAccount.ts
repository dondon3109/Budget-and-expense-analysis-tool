import { useSyncExternalStore } from "react";

/**
 * The account the last new transaction was saved on; the next one starts there. It is a
 * per-browser preference, like the voice language: it never reaches the server, so each
 * device keeps its own. The key is the one the default spending account used, so an account
 * chosen there is where the next entry starts.
 */
export const LAST_USED_ACCOUNT_STORAGE_KEY = "zoption-default-spending-account";

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED_ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LAST_USED_ACCOUNT_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLastUsedAccountId(accountId: string): void {
  try {
    window.localStorage.setItem(LAST_USED_ACCOUNT_STORAGE_KEY, accountId);
  } catch {
    // Private browsing or a full quota: nothing is remembered and new entries keep the fallback.
  }
  for (const listener of listeners) listener();
}

export function useLastUsedAccountId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
