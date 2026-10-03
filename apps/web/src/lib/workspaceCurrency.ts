import { isCurrency, type Currency } from "@zoption/shared";

/**
 * The workspace currency that `formatMoney` falls back to for amounts with no currency of their
 * own. The server owns the setting; `WorkspaceCurrencyBoundary` assigns this value from the
 * settings query before it renders the private page, and keys the page by it, so everything
 * that reads it renders again (remounted) when it changes. Nothing subscribes to it.
 */
let current: Currency = "PHP";

export function workspaceCurrency(): Currency {
  return current;
}

export function setWorkspaceCurrency(currency: Currency): void {
  current = currency;
}

/** For components: the page remounts when the currency changes, so a plain read stays fresh. */
export function useWorkspaceCurrency(): Currency {
  return current;
}

/**
 * The last currency the server confirmed for one user, remembered in this browser so their next
 * load renders at once in the right currency. Keyed by user: whoever signs in next on a shared
 * browser never inherits it.
 */
export function workspaceCurrencyStorageKey(userId: string): string {
  return `zoption-workspace-currency:${userId}`;
}

export function rememberedWorkspaceCurrency(userId: string): Currency | undefined {
  try {
    const stored = window.localStorage.getItem(workspaceCurrencyStorageKey(userId));
    return isCurrency(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function rememberWorkspaceCurrency(userId: string, currency: Currency): void {
  try {
    window.localStorage.setItem(workspaceCurrencyStorageKey(userId), currency);
  } catch {
    // Private browsing or a full quota: the next load waits for the settings request instead.
  }
}
