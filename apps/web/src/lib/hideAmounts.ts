import { useSyncExternalStore } from "react";

/**
 * The "hide balance" choice for screen sharing and screenshots. `formatMoney` reads it, and
 * `WorkspaceCurrencyBoundary` keys the private page by it, so every amount re-renders masked or
 * shown when it flips. Remembered in this browser only; it never reaches the server.
 */
const STORAGE_KEY = "zoption-hide-amounts";
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let hidden = typeof window === "undefined" ? false : readStored();

export function amountsHidden(): boolean {
  return hidden;
}

export function setAmountsHidden(next: boolean): void {
  hidden = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or a full quota: the choice lasts until the tab closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, amountsHidden);
}
