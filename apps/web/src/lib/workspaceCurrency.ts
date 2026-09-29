import type { Currency } from "@zoption/shared";
import { useSyncExternalStore } from "react";

/**
 * The workspace currency that `formatMoney` falls back to for amounts with no currency of their
 * own. The server owns the setting; this store mirrors the last value the settings query read,
 * and remembers it in this browser so a USD workspace does not flash pesos on the next load.
 */
export const WORKSPACE_CURRENCY_STORAGE_KEY = "zoption-workspace-currency";

const listeners = new Set<() => void>();

function readStored(): Currency {
  try {
    return window.localStorage.getItem(WORKSPACE_CURRENCY_STORAGE_KEY) === "USD" ? "USD" : "PHP";
  } catch {
    return "PHP";
  }
}

let current: Currency = typeof window === "undefined" ? "PHP" : readStored();

export function workspaceCurrency(): Currency {
  return current;
}

export function setWorkspaceCurrency(currency: Currency): void {
  if (currency === current) return;
  current = currency;
  try {
    window.localStorage.setItem(WORKSPACE_CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Private browsing or a full quota: the next load starts from PHP until the query answers.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspaceCurrency(): Currency {
  return useSyncExternalStore(subscribe, workspaceCurrency, () => "PHP");
}
