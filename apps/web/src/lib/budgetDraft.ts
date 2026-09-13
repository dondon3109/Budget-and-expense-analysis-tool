/**
 * In-progress budget edits, kept in sessionStorage so they outlive the page component.
 *
 * Why storage rather than interception alone: pressing the browser Back button fires
 * popstate, react-router navigates at once, and this page unmounts before any guard of
 * ours can run — taking the draft with it. Blocking that reliably needs a data router and
 * `useBlocker`, which this app cannot adopt without reworking its prerender pipeline
 * (createBrowserRouter has no static-render equivalent here). Persisting the draft removes
 * the data-loss risk instead of trying to prevent the navigation, and it also covers a
 * crashed tab, a refresh, and any future path we have not thought of.
 *
 * Cleared on a successful save and whenever the user explicitly confirms a discard.
 */
const KEY_PREFIX = "zoption-budget-draft:";

export type BudgetDraft = Record<string, string>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Private browsing or a blocked storage API must never break the page.
    return null;
  }
}

function keyFor(month: string): string {
  return `${KEY_PREFIX}${month}`;
}

/** Returns the stored draft for a month, or null when there is nothing usable to restore. */
export function readBudgetDraft(month: string): BudgetDraft | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(keyFor(month));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}

export function persistBudgetDraft(month: string, drafts: BudgetDraft): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(month), JSON.stringify(drafts));
  } catch {
    // A full or unavailable store is not worth failing the page over.
  }
}

export function clearBudgetDraft(month: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(month));
  } catch {
    // Ignore: the worst case is a stale draft that the next save clears.
  }
}
