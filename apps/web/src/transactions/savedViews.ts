import { transactionKinds, type TransactionListQuery } from "@zoption/shared";

export const SAVED_VIEWS_STORAGE_KEY = "zoption-transaction-views";
export const SAVED_VIEW_NAME_MAX = 40;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The URL-backed filter set a saved view captures and re-applies. */
export type SavedTransactionFilters = Pick<
  TransactionListQuery,
  "search" | "kind" | "accountId" | "categoryId" | "from" | "to"
>;

export interface SavedTransactionView {
  id: string;
  name: string;
  filters: SavedTransactionFilters;
}

export function savedViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function optionalParam(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isTransactionKind(value: string): value is NonNullable<SavedTransactionFilters["kind"]> {
  return (transactionKinds as readonly string[]).includes(value);
}

/** Drops malformed entries instead of failing the whole list: storage is user-writable. */
function parseSavedView(value: unknown): SavedTransactionView | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  const rawFilters = candidate.filters;
  if (!rawFilters || typeof rawFilters !== "object") return null;
  const raw = rawFilters as Record<string, unknown>;
  const kind = optionalParam(raw.kind);
  const from = optionalParam(raw.from);
  const to = optionalParam(raw.to);
  return {
    id: candidate.id,
    name: candidate.name.trim().slice(0, SAVED_VIEW_NAME_MAX),
    filters: {
      search: optionalParam(raw.search),
      kind: kind && isTransactionKind(kind) ? kind : undefined,
      accountId: optionalParam(raw.accountId),
      categoryId: optionalParam(raw.categoryId),
      from: from && ISO_DATE_PATTERN.test(from) ? from : undefined,
      to: to && ISO_DATE_PATTERN.test(to) ? to : undefined,
    },
  };
}

export function readSavedViews(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): SavedTransactionView[] {
  try {
    const value = storage.getItem(SAVED_VIEWS_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSavedView)
      .filter((view): view is SavedTransactionView => view !== null);
  } catch {
    return [];
  }
}

export function persistSavedViews(
  views: SavedTransactionView[],
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  try {
    storage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Storage can be unavailable (private mode); the in-memory views still work.
  }
}
