import { transactionKinds, type TransactionListQuery } from "@zoption/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { SavedTransactionFilters } from "../transactions/savedViews";
import {
  DEFAULT_TRANSACTION_SORT,
  persistTransactionSortPreference,
  readTransactionSortPreference,
  TRANSACTION_SORT_STORAGE_KEY,
} from "../transactions/sortPreference";

// The ledger scrolls continuously: `page` stays 1 here and each loaded page supplies its own.
const initialQuery: TransactionListQuery = {
  page: 1,
  pageSize: 50,
  ...DEFAULT_TRANSACTION_SORT,
};

export const SORT_OPTIONS = [
  { value: "date-desc", label: "Date: newest first", sortBy: "date", sortDirection: "desc" },
  { value: "date-asc", label: "Date: oldest first", sortBy: "date", sortDirection: "asc" },
  {
    value: "description-asc",
    label: "Description: A–Z",
    sortBy: "description",
    sortDirection: "asc",
  },
  {
    value: "description-desc",
    label: "Description: Z–A",
    sortBy: "description",
    sortDirection: "desc",
  },
  { value: "amount-asc", label: "Amount: lowest first", sortBy: "amount", sortDirection: "asc" },
  {
    value: "amount-desc",
    label: "Amount: highest first",
    sortBy: "amount",
    sortDirection: "desc",
  },
] satisfies Array<{
  value: string;
  label: string;
  sortBy: TransactionListQuery["sortBy"];
  sortDirection: TransactionListQuery["sortDirection"];
}>;

const SEARCH_DEBOUNCE_MS = 300;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Filters currently applied to the ledger; the shape a saved view captures. */
export type TransactionFilterState = SavedTransactionFilters;

const EMPTY_FILTERS: TransactionFilterState = {
  search: undefined,
  kind: undefined,
  accountId: undefined,
  categoryId: undefined,
  from: undefined,
  to: undefined,
};

function normalizeSearch(value: string): string | undefined {
  return value.trim() || undefined;
}

function isTransactionKind(value: string | null): value is TransactionListQuery["kind"] & string {
  return value !== null && (transactionKinds as readonly string[]).includes(value);
}

/** Reads the bookmarkable filter set from the URL, ignoring values the API would reject. */
function readFiltersFromParams(params: URLSearchParams): TransactionFilterState {
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const validFrom = rawFrom && ISO_DATE_PATTERN.test(rawFrom) ? rawFrom : undefined;
  const validTo = rawTo && ISO_DATE_PATTERN.test(rawTo) ? rawTo : undefined;
  const range =
    validFrom && validTo && validFrom > validTo
      ? { from: undefined, to: undefined }
      : { from: validFrom, to: validTo };
  const kind = params.get("kind");
  return {
    search: normalizeSearch(params.get("search") ?? ""),
    kind: isTransactionKind(kind) ? kind : undefined,
    accountId: params.get("account") ?? undefined,
    categoryId: params.get("category") ?? undefined,
    ...range,
  };
}

/** Writes only the filter params so unrelated deep links (?add=1, ?month=) survive. */
function writeFiltersToParams(
  params: URLSearchParams,
  filters: TransactionFilterState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const entries: Array<[string, string | undefined]> = [
    ["search", filters.search],
    ["kind", filters.kind],
    ["account", filters.accountId],
    ["category", filters.categoryId],
    ["from", filters.from],
    ["to", filters.to],
  ];
  for (const [key, value] of entries) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

export function sameFilters(a: TransactionFilterState, b: TransactionFilterState): boolean {
  return (
    (a.search ?? undefined) === (b.search ?? undefined) &&
    (a.kind ?? undefined) === (b.kind ?? undefined) &&
    (a.accountId ?? undefined) === (b.accountId ?? undefined) &&
    (a.categoryId ?? undefined) === (b.categoryId ?? undefined) &&
    (a.from ?? undefined) === (b.from ?? undefined) &&
    (a.to ?? undefined) === (b.to ?? undefined)
  );
}

function filterStateOf(query: TransactionListQuery): TransactionFilterState {
  return {
    search: query.search,
    kind: query.kind,
    accountId: query.accountId,
    categoryId: query.categoryId,
    from: query.from,
    to: query.to,
  };
}

/**
 * The Transactions ledger query: filters and sort, the debounced search draft, and the two-way
 * sync that keeps the filter params in the URL so a view can be bookmarked or reloaded.
 */
export function useTransactionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState<TransactionListQuery>(() => ({
    ...initialQuery,
    ...readTransactionSortPreference(),
    ...readFiltersFromParams(searchParams),
  }));
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("search") ?? "");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function syncTransactionSort(event: StorageEvent) {
      if (event.key !== TRANSACTION_SORT_STORAGE_KEY) return;

      const preference = readTransactionSortPreference({
        getItem: () => event.newValue,
      });
      setQuery((current) => ({ ...current, ...preference }));
    }

    window.addEventListener("storage", syncTransactionSort);
    return () => window.removeEventListener("storage", syncTransactionSort);
  }, []);

  const filters = useMemo(() => filterStateOf(query), [query]);
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  // Filters write to the URL so a view can be bookmarked or reloaded. This effect only fires
  // when the filters change; the read-back effect below owns external URL changes (back/forward).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setSearchParams(
      (current) => {
        const next = writeFiltersToParams(current, filters);
        return next.toString() === current.toString() ? current : next;
      },
      { replace: true },
    );
  }, [filters, setSearchParams]);

  useEffect(() => {
    const fromUrl = readFiltersFromParams(searchParams);
    setQuery((current) =>
      sameFilters(filterStateOf(current), fromUrl)
        ? current
        : { ...current, ...EMPTY_FILTERS, ...fromUrl },
    );
    setSearchDraft((current) => {
      const next = searchParams.get("search") ?? "";
      return normalizeSearch(current) === normalizeSearch(next) ? current : next;
    });
  }, [searchParams]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const nextSearch = normalizeSearch(searchDraft);
    if (nextSearch === query.search) return;

    searchTimerRef.current = setTimeout(() => {
      setQuery((current) =>
        current.search === nextSearch ? current : { ...current, search: nextSearch },
      );
      searchTimerRef.current = undefined;
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query.search, searchDraft]);

  const hasFilters = Boolean(
    searchDraft.trim() ||
    query.search ||
    query.kind ||
    query.categoryId ||
    query.accountId ||
    query.from ||
    query.to,
  );

  function updateFilters(change: Partial<TransactionListQuery>) {
    setQuery((current) => ({ ...current, ...change }));
  }

  function applySearchImmediately() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const nextSearch = normalizeSearch(searchDraft);
    setQuery((current) =>
      current.search === nextSearch ? current : { ...current, search: nextSearch },
    );
  }

  function clearFilters() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = undefined;
    setSearchDraft("");
    setQuery((current) => ({
      ...initialQuery,
      pageSize: current.pageSize,
      sortBy: current.sortBy,
      sortDirection: current.sortDirection,
    }));
  }

  /** Applies a saved view's filters through the same path as manual filtering. */
  function applySavedFilters(savedFilters: TransactionFilterState) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = undefined;
    setSearchDraft(savedFilters.search ?? "");
    // Same state path as manual filtering, so the URL effect writes the filter params.
    setQuery((current) => ({ ...current, ...savedFilters }));
  }

  function updateSort(
    sortBy: TransactionListQuery["sortBy"],
    sortDirection: TransactionListQuery["sortDirection"],
  ) {
    persistTransactionSortPreference({ sortBy, sortDirection });
    setQuery((current) => ({ ...current, sortBy, sortDirection }));
  }

  function handleSort(sortBy: TransactionListQuery["sortBy"]) {
    const sortDirection =
      query.sortBy === sortBy && query.sortDirection === "desc" ? "asc" : "desc";
    updateSort(sortBy, sortDirection);
  }

  function handleSortOption(value: string) {
    const option = SORT_OPTIONS.find((candidate) => candidate.value === value);
    if (option) updateSort(option.sortBy, option.sortDirection);
  }

  const activeSortOption =
    SORT_OPTIONS.find(
      (option) => option.sortBy === query.sortBy && option.sortDirection === query.sortDirection,
    ) ?? SORT_OPTIONS[0]!;

  return {
    query,
    filters,
    filtersKey,
    searchDraft,
    setSearchDraft,
    hasFilters,
    updateFilters,
    applySearchImmediately,
    clearFilters,
    applySavedFilters,
    handleSort,
    handleSortOption,
    activeSortOption,
  };
}
