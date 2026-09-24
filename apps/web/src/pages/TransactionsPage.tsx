import {
  matchCategory,
  preferredTransactionAccount,
  transactionKinds,
  type TransactionExportQuery,
  type TransactionInput,
  type TransactionListItem,
  type TransactionListQuery,
  type TransactionPage,
} from "@zoption/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderCog,
  MessageSquare,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Tags,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { SkeletonStatus, SkeletonTableRows } from "../components/common/Skeleton";
import { CategoryManager } from "../components/transactions/CategoryManager";
import {
  SmsQuickPasteModal,
  type ParsedSmsTransaction,
} from "../components/transactions/SmsQuickPasteModal";
import { TransactionFilters } from "../components/transactions/TransactionFilters";
import {
  TransactionForm,
  type TransactionFormDraft,
} from "../components/transactions/TransactionForm";
import { TransactionTable } from "../components/transactions/TransactionTable";
import { AppShell } from "../components/layout/AppShell";
import { localIsoDate } from "../lib/calendar";
import {
  createTransaction,
  deleteTransaction,
  downloadTransactions,
  getCategories,
  getAccounts,
  getDebts,
  getTransactions,
  isBillingEnforcementError,
  updateTransaction,
} from "../lib/api";
import { useDefaultSpendingAccountId } from "../lib/defaultSpendingAccount";
import { formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { optimisticId, restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import {
  deleteOptimisticTransaction,
  optimisticTransaction,
  saveOptimisticTransaction,
} from "../lib/optimisticTransactions";
import { userWorkspace } from "../lib/workspace";
import {
  persistSavedViews,
  readSavedViews,
  savedViewId,
  SAVED_VIEW_NAME_MAX,
  type SavedTransactionFilters,
  type SavedTransactionView,
} from "../transactions/savedViews";
import {
  DEFAULT_TRANSACTION_SORT,
  persistTransactionSortPreference,
  readTransactionSortPreference,
  TRANSACTION_SORT_STORAGE_KEY,
} from "../transactions/sortPreference";
import "./TransactionsPage.css";

const initialQuery: TransactionListQuery = {
  page: 1,
  pageSize: 10,
  ...DEFAULT_TRANSACTION_SORT,
};

const SORT_OPTIONS = [
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
type TransactionFilterState = SavedTransactionFilters;

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

function sameFilters(a: TransactionFilterState, b: TransactionFilterState): boolean {
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

/** Rebuilds the create payload so an undone delete recreates the same record. */
function transactionInputFromItem(item: TransactionListItem): TransactionInput | null {
  const amountMinor = Math.abs(item.amountMinor);
  if (amountMinor <= 0) return null;
  const base = {
    date: item.date,
    description: item.description,
    amountMinor,
    currency: item.currency,
    categoryId: item.categoryId,
    notes: item.notes ?? undefined,
  };
  if (item.kind === "income" || item.kind === "expense") {
    if (!item.accountId) return null;
    return { ...base, kind: item.kind, accountId: item.accountId };
  }
  if (!item.fromAccountId || !item.toAccountId) return null;
  return {
    ...base,
    kind: "transfer",
    fromAccountId: item.fromAccountId,
    toAccountId: item.toAccountId,
    transferFeeMinor: item.transferFeeMinor ?? undefined,
  };
}

function deleteConsequence(items: TransactionListItem[]): string {
  if (items.length === 1) {
    const item = items[0]!;
    return `“${item.description}” (${formatMoney(Math.abs(item.amountMinor), item.currency)}) will be removed from your ledger. You can undo it right below the list.`;
  }
  const names = items
    .slice(0, 3)
    .map((item) => `“${item.description}”`)
    .join(", ");
  const extra = items.length > 3 ? `, and ${items.length - 3} more` : "";
  return `${items.length} transactions (${names}${extra}) will be removed from your ledger. You can undo them right below the list.`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function TransactionsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState<TransactionListQuery>(() => ({
    ...initialQuery,
    ...readTransactionSortPreference(),
    ...readFiltersFromParams(searchParams),
  }));
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("search") ?? "");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [formOpen, setFormOpen] = useState(() => searchParams.get("add") === "1");
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionListItem>();
  const [formDraft, setFormDraft] = useState<TransactionFormDraft>();
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [recentlyDeleted, setRecentlyDeleted] = useState<TransactionListItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{
    items: TransactionListItem[];
    trigger: HTMLButtonElement | null;
  }>();
  const [views, setViews] = useState<SavedTransactionView[]>(() => readSavedViews());
  const [viewName, setViewName] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState("");

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(workspace, true),
    queryFn: () => getCategories(workspace, true),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
  });
  const debtsQuery = useQuery({
    queryKey: queryKeys.debts(workspace),
    queryFn: () => getDebts(workspace),
  });
  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactions(workspace, query),
    queryFn: () => getTransactions(workspace, query),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    function syncTransactionSort(event: StorageEvent) {
      if (event.key !== TRANSACTION_SORT_STORAGE_KEY) return;

      const preference = readTransactionSortPreference({
        getItem: () => event.newValue,
      });
      setQuery((current) => ({ ...current, ...preference, page: 1 }));
    }

    window.addEventListener("storage", syncTransactionSort);
    return () => window.removeEventListener("storage", syncTransactionSort);
  }, []);

  useEffect(() => {
    if (searchParams.get("add") !== "1") return;

    setEditing(undefined);
    setFormOpen(true);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("add");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const filters = useMemo(() => filterStateOf(query), [query]);
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const activeView = views.find((view) => view.id === activeViewId);

  // The Views select only reflects reality: a manual filter change drops the applied view.
  useEffect(() => {
    if (!activeViewId) return;
    const applied = views.find((candidate) => candidate.id === activeViewId);
    if (!applied || !sameFilters(filters, applied.filters)) setActiveViewId("");
  }, [activeViewId, filters, views]);

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
        : { ...current, ...EMPTY_FILTERS, ...fromUrl, page: 1 },
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
        current.search === nextSearch ? current : { ...current, search: nextSearch, page: 1 },
      );
      searchTimerRef.current = undefined;
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query.search, searchDraft]);

  // A hidden row must never be acted on: drop the selection whenever the visible set changes.
  useEffect(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [filtersKey, query.page]);

  const refreshProductData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      // A saved debt payment moves the linked debt's balance, so the planning page reads it fresh.
      queryClient.invalidateQueries({ queryKey: queryKeys.debts(workspace) }),
    ]);
  };

  const saveMutation = useMutation({
    // The edit target travels in the variables: onMutate clears `editing`, and a re-render before
    // mutationFn runs swaps in options whose closure no longer sees it, turning an edit into a create.
    mutationFn: async ({ input, form }: { input: TransactionInput; form?: TransactionListItem }) =>
      form && !form.id.startsWith("optimistic:")
        ? updateTransaction(workspace, { id: form.id, input })
        : createTransaction(workspace, input),
    onMutate: async ({ input, form }) => {
      const id = form?.id ?? optimisticId("transaction");
      const item = optimisticTransaction(
        id,
        input,
        categoriesQuery.data ?? [],
        accountsQuery.data ?? [],
        debtsQuery.data?.items ?? [],
        form?.createdAt,
      );
      const snapshot = await updateOptimistically<TransactionPage>(
        queryClient,
        queryKeys.transactions(workspace, query),
        (current) => saveOptimisticTransaction(current, query, item, form?.id),
      );
      setFormOpen(false);
      setEditing(undefined);
      return { form, id, item, snapshot };
    },
    onError: (_error, _input, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
      setEditing(context?.form ?? context?.item);
      setFormOpen(true);
    },
    onSuccess: (saved, _input, context) => {
      queryClient.setQueryData<TransactionPage>(
        queryKeys.transactions(workspace, query),
        (current) => saveOptimisticTransaction(current, query, saved, context.id),
      );
    },
    onSettled: () => {
      void refreshProductData();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (items: TransactionListItem[]) => {
      for (const item of items) await deleteTransaction(workspace, item.id);
    },
    onMutate: async (items) => {
      const snapshot = await updateOptimistically<TransactionPage>(
        queryClient,
        queryKeys.transactions(workspace, query),
        (current) =>
          items.reduce<TransactionPage | undefined>(
            (page, item) => deleteOptimisticTransaction(page, item.id),
            current,
          ),
      );
      return { snapshot };
    },
    onError: (_error, _items, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSettled: () => {
      void refreshProductData();
    },
  });
  const undoDeleteMutation = useMutation({
    mutationFn: async (items: TransactionListItem[]) => {
      for (const item of items) {
        const input = transactionInputFromItem(item);
        if (!input) {
          throw new Error(
            `“${item.description}” can no longer be restored because its account is missing.`,
          );
        }
        await createTransaction(workspace, input);
      }
    },
    onMutate: async (items) => {
      const snapshot = await updateOptimistically<TransactionPage>(
        queryClient,
        queryKeys.transactions(workspace, query),
        (current) =>
          items.reduce<TransactionPage | undefined>(
            (page, item) => saveOptimisticTransaction(page, query, item),
            current,
          ),
      );
      return { snapshot };
    },
    onError: (_error, _items, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSuccess: () => setRecentlyDeleted([]),
    onSettled: () => {
      void refreshProductData();
    },
  });
  const bulkCategoryMutation = useMutation({
    mutationFn: async (args: { ids: string[]; categoryId: string }) => {
      for (const id of args.ids) {
        await updateTransaction(workspace, { id, input: { categoryId: args.categoryId } });
      }
    },
    onMutate: async ({ ids, categoryId }) => {
      const category = categoriesQuery.data?.find((candidate) => candidate.id === categoryId);
      const idSet = new Set(ids);
      const snapshot = await updateOptimistically<TransactionPage>(
        queryClient,
        queryKeys.transactions(workspace, query),
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  idSet.has(item.id) && category
                    ? {
                        ...item,
                        categoryId,
                        categoryName: category.name,
                        categoryColor: category.color,
                        categoryIconEmoji: category.iconEmoji ?? null,
                      }
                    : item,
                ),
              }
            : current,
      );
      return { snapshot };
    },
    onError: (_error, _args, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkCategoryId("");
    },
    onSettled: () => {
      void refreshProductData();
    },
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const accounts = accountsQuery.data ?? [];
  const defaultSpendingAccountId = useDefaultSpendingAccountId();
  const debts = debtsQuery.data?.items ?? [];
  const page = transactionsQuery.data;
  const hasFilters = Boolean(
    searchDraft.trim() ||
    query.search ||
    query.kind ||
    query.categoryId ||
    query.accountId ||
    query.from ||
    query.to,
  );
  const selectedItems = useMemo(
    () => (page?.items ?? []).filter((item) => selectedIds.has(item.id)),
    [page?.items, selectedIds],
  );
  const selectedKinds = useMemo(
    () => new Set(selectedItems.map((item) => item.kind)),
    [selectedItems],
  );
  const bulkCategories = useMemo(
    () => categories.filter((category) => !category.archived && selectedKinds.has(category.kind)),
    [categories, selectedKinds],
  );
  const deletingIds = useMemo(() => {
    if (!deleteMutation.isPending) return undefined;
    return new Set((deleteMutation.variables ?? []).map((item) => item.id));
  }, [deleteMutation.isPending, deleteMutation.variables]);

  useEffect(() => {
    setBulkCategoryId((current) =>
      current && bulkCategories.some((category) => category.id === current) ? current : "",
    );
  }, [bulkCategories]);

  // The confirmed delete removes the row that owned focus, so hand focus to Undo rather than
  // dropping it on <body>.
  useEffect(() => {
    if (recentlyDeleted.length === 0) return;
    if (document.activeElement !== document.body) return;
    undoButtonRef.current?.focus();
  }, [recentlyDeleted]);

  // Keep the selection to rows that are still on screen.
  useEffect(() => {
    const visible = new Set((page?.items ?? []).map((item) => item.id));
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [page?.items]);

  function openCreate() {
    setEditing(undefined);
    saveMutation.reset();
    setFormOpen(true);
  }

  const shortcutsRef = useRef({ openCreate });
  shortcutsRef.current.openCreate = openCreate;

  // Surface-scoped shortcuts: "/" reaches search, "n" starts a new record, and "j"/"k" walk the
  // ledger rows. Bare keys are ignored while the user is typing or while any dialog owns the screen.
  useEffect(() => {
    function moveRowFocus(direction: 1 | -1) {
      const rows = panelRef.current?.querySelectorAll<HTMLElement>("[data-ledger-row]");
      if (!rows || rows.length === 0) return;
      const list = Array.from(rows);
      const current = list.indexOf(document.activeElement as HTMLElement);
      const next = current === -1 ? 0 : Math.min(Math.max(current + direction, 0), list.length - 1);
      list[next]?.focus();
    }

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "n") {
        event.preventDefault();
        shortcutsRef.current.openCreate();
        return;
      }
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        moveRowFocus(event.key === "j" ? 1 : -1);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const handleApplySms = (parsed: ParsedSmsTransaction) => {
    if (parsed.amount === undefined || isNaN(parsed.amount)) return;
    const kind = parsed.type;
    const matchedCategory = matchCategory(categories, parsed.suggestedCategory, {
      kind,
      contextText: parsed.merchant,
    });
    const matchedAccount =
      accounts.find(
        (a) =>
          parsed.account &&
          (a.name.toLowerCase().includes(parsed.account.replaceAll("*", "").toLowerCase()) ||
            a.id === parsed.account),
      ) ??
      preferredTransactionAccount(accounts, defaultSpendingAccountId) ??
      accounts[0];

    const categoryId = matchedCategory?.id ?? categories.find((c) => c.kind === kind)?.id ?? "";
    const notes = parsed.referenceNumber ? `Ref: ${parsed.referenceNumber}` : "";

    setFormDraft({
      kind,
      amount: parsed.amount.toFixed(2),
      date: parsed.date || localIsoDate(),
      description: parsed.merchant || "SMS Transaction",
      categoryId,
      accountId: matchedAccount?.id ?? "",
      notes,
      currency: parsed.currency === "USD" ? "USD" : matchedAccount?.currency || "PHP",
    });
    setEditing(undefined);
    setFormOpen(true);
    setIsSmsModalOpen(false);
  };

  function updateFilters(change: Partial<TransactionListQuery>) {
    setQuery((current) => ({ ...current, ...change, page: 1 }));
  }

  function applySearchImmediately() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const nextSearch = normalizeSearch(searchDraft);
    setQuery((current) =>
      current.search === nextSearch ? current : { ...current, search: nextSearch, page: 1 },
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

  function applySavedView(id: string) {
    const view = views.find((candidate) => candidate.id === id);
    if (!view) {
      setActiveViewId("");
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = undefined;
    setSearchDraft(view.filters.search ?? "");
    // Same state path as manual filtering, so the URL effect writes the filter params.
    setQuery((current) => ({ ...current, ...view.filters, page: 1 }));
    setActiveViewId(view.id);
  }

  function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = viewName.trim().slice(0, SAVED_VIEW_NAME_MAX);
    if (!name) return;
    const view: SavedTransactionView = { id: savedViewId(), name, filters };
    // Saving under an existing name replaces that view instead of stacking duplicates.
    const next = [...views.filter((candidate) => candidate.name !== name), view];
    setViews(next);
    persistSavedViews(next);
    setActiveViewId(view.id);
    setViewName("");
    setSaveViewOpen(false);
  }

  function deleteSavedView(view: SavedTransactionView) {
    const next = views.filter((candidate) => candidate.id !== view.id);
    setViews(next);
    persistSavedViews(next);
    if (activeViewId === view.id) setActiveViewId("");
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visible = page?.items ?? [];
    setSelectedIds((current) => {
      const allSelected = visible.length > 0 && visible.every((item) => current.has(item.id));
      return allSelected ? new Set() : new Set(visible.map((item) => item.id));
    });
  }

  function requestDelete(item: TransactionListItem, trigger: HTMLButtonElement) {
    deleteMutation.reset();
    setPendingDelete({ items: [item], trigger });
  }

  function requestBulkDelete() {
    if (selectedItems.length === 0) return;
    deleteMutation.reset();
    setPendingDelete({ items: selectedItems, trigger: null });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const items = pendingDelete.items;
    deleteMutation.mutate(items, {
      onSuccess: () => {
        setRecentlyDeleted(items);
        setPendingDelete(undefined);
        setSelectedIds(new Set());
      },
    });
  }

  function openEdit(item: TransactionListItem) {
    setEditing(item);
    saveMutation.reset();
    setFormOpen(true);
  }

  function updateSort(
    sortBy: TransactionListQuery["sortBy"],
    sortDirection: TransactionListQuery["sortDirection"],
  ) {
    persistTransactionSortPreference({ sortBy, sortDirection });
    setQuery((current) => ({ ...current, page: 1, sortBy, sortDirection }));
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

  const paginationRange = page
    ? {
        start: (page.page - 1) * page.pageSize + 1,
        end: Math.min((page.page - 1) * page.pageSize + page.items.length, page.total),
      }
    : { start: 0, end: 0 };

  async function handleExport() {
    setExporting(true);
    setExportError(undefined);
    try {
      const filters: TransactionExportQuery = {
        search: query.search,
        categoryId: query.categoryId,
        accountId: query.accountId,
        kind: query.kind,
        from: query.from,
        to: query.to,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      };
      await downloadTransactions(workspace, filters);
    } catch (error) {
      setExportError(
        error instanceof Error ? error : new Error("The export could not be prepared."),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <div className="dashboard-page transactions-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Activity</p>
            <h1>Transactions</h1>
            <p>Review, organize, and correct the records behind every dashboard total.</p>
          </div>
          <div className="header-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              <Download size={17} /> {exporting ? "Preparing…" : "Export CSV"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setCategoryManagerOpen(true)}
            >
              <FolderCog size={17} /> Categories
            </button>
            <Link className="button secondary" to="/app/import?mode=receipt">
              <Receipt size={17} /> Scan receipt
            </Link>
            <button
              className="button secondary"
              type="button"
              onClick={() => setIsSmsModalOpen(true)}
            >
              <MessageSquare size={17} /> Paste SMS
            </button>
            <button className="button primary" type="button" onClick={openCreate}>
              <Plus size={17} /> Add transaction
            </button>
          </div>
        </header>

        <TransactionFilters
          search={searchDraft}
          kind={query.kind}
          categoryId={query.categoryId}
          accountId={query.accountId}
          from={query.from}
          to={query.to}
          categories={categories}
          accounts={accounts}
          hasFilters={hasFilters}
          searchInputRef={searchInputRef}
          onSearchChange={setSearchDraft}
          onSearch={applySearchImmediately}
          onKindChange={(kind) => updateFilters({ kind, categoryId: undefined })}
          onCategoryChange={(categoryId) => updateFilters({ categoryId })}
          onAccountChange={(accountId) => updateFilters({ accountId })}
          onFromChange={(from) => updateFilters({ from })}
          onToChange={(to) => updateFilters({ to })}
          onDatePreset={({ from, to }) => updateFilters({ from, to })}
          onClear={clearFilters}
        />

        {/* The panel is deliberately not a live region: the pagination status below (or the empty
            state when nothing matches) announces result changes once, instead of the whole panel
            — table rows included — re-announcing on every update. */}
        <section ref={panelRef} className="transactions-panel">
          <div className="transactions-panel-heading">
            <div>
              <strong>
                {page
                  ? `${page.total} transaction${page.total === 1 ? "" : "s"}`
                  : "Loading transactions"}
              </strong>
              <span>
                {transactionsQuery.isFetching && page
                  ? "Refreshing list…"
                  : "Personal workspace · Philippine pesos"}
              </span>
            </div>
            <div className="transaction-list-actions">
              <button
                className="refresh-button"
                type="button"
                onClick={() => void transactionsQuery.refetch()}
                disabled={transactionsQuery.isFetching}
                aria-label="Refresh transactions"
              >
                <RefreshCw size={15} className={transactionsQuery.isFetching ? "spinning" : ""} />{" "}
                <span className="refresh-button-label">Refresh</span>
              </button>
              <span className="transaction-list-divider" aria-hidden="true" />
              <label className="transaction-sort-control">
                <span>Sort by</span>
                <select
                  value={activeSortOption.value}
                  onChange={(event) => handleSortOption(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="transaction-list-divider" aria-hidden="true" />
              <div className="transaction-views">
                <label className="transaction-sort-control">
                  <span>Views</span>
                  <select
                    value={activeViewId}
                    onChange={(event) => applySavedView(event.target.value)}
                    disabled={views.length === 0}
                  >
                    <option value="">
                      {views.length === 0 ? "No saved views" : "Select a view"}
                    </option>
                    {views.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.name}
                      </option>
                    ))}
                  </select>
                </label>
                {saveViewOpen ? (
                  <form className="transaction-view-save" onSubmit={saveCurrentView}>
                    <label className="transaction-view-name">
                      <span className="sr-only">View name</span>
                      <input
                        value={viewName}
                        maxLength={SAVED_VIEW_NAME_MAX}
                        placeholder="Name this view"
                        onChange={(event) => setViewName(event.target.value)}
                      />
                    </label>
                    <button className="button secondary" type="submit" disabled={!viewName.trim()}>
                      Save
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setSaveViewOpen(false);
                        setViewName("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setSaveViewOpen(true)}
                  >
                    Save view
                  </button>
                )}
                {activeView && (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete view ${activeView.name}`}
                    onClick={() => deleteSavedView(activeView)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="transaction-bulk-toolbar" role="group" aria-label="Bulk actions">
              <div className="transaction-bulk-count">
                <Tags size={17} aria-hidden="true" />
                <span role="status" aria-live="polite">
                  {selectedItems.length} selected
                </span>
              </div>
              <label className="transaction-bulk-field">
                <span>Change category to</span>
                <select
                  value={bulkCategoryId}
                  onChange={(event) => setBulkCategoryId(event.target.value)}
                >
                  <option value="">Choose a category</option>
                  {bulkCategories.map((category) => (
                    <option key={category.id} value={category.id} disabled={category.locked}>
                      {category.name}
                      {category.locked ? " — Pro required" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                type="button"
                disabled={!bulkCategoryId || bulkCategoryMutation.isPending}
                onClick={() =>
                  bulkCategoryMutation.mutate({
                    ids: selectedItems.map((item) => item.id),
                    categoryId: bulkCategoryId,
                  })
                }
              >
                {bulkCategoryMutation.isPending ? "Applying…" : "Change category"}
              </button>
              <span className="transaction-bulk-spacer" />
              <button
                className="button secondary"
                type="button"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </button>
              <button className="button danger" type="button" onClick={requestBulkDelete}>
                Delete selected
              </button>
              {bulkCategoryMutation.isError && (
                <p className="page-error" role="alert">
                  {bulkCategoryMutation.error.message}
                </p>
              )}
            </div>
          )}

          {transactionsQuery.isPending && (
            <SkeletonStatus label="Loading transaction records">
              {/* Mirrors TransactionTable's real header: select, date, description,
                  category, type, amount, row actions. */}
              <div className="transaction-table-wrap" aria-hidden="true">
                <table className="transaction-table transaction-table-skeleton">
                  <tbody>
                    <SkeletonTableRows rows={6} columns={7} />
                  </tbody>
                </table>
              </div>
            </SkeletonStatus>
          )}
          {transactionsQuery.isError && (
            <div className="table-status error" role="alert">
              <strong>Transactions could not be loaded.</strong>
              <span>{transactionsQuery.error.message}</span>
              <button type="button" onClick={() => void transactionsQuery.refetch()}>
                Try again
              </button>
            </div>
          )}
          {page && page.items.length === 0 && (
            <div className="empty-transactions">
              {/* Takes over from the pagination status, which is not rendered for an empty page. */}
              <strong role="status">No transactions match these filters.</strong>
              <p>Clear the filters or add a new transaction to your workspace.</p>
              <button className="button primary" type="button" onClick={openCreate}>
                <Plus size={16} /> Add transaction
              </button>
            </div>
          )}
          {page && page.items.length > 0 && (
            <>
              <TransactionTable
                items={page.items}
                sortBy={query.sortBy}
                sortDirection={query.sortDirection}
                selectedIds={selectedIds}
                busyIds={deletingIds}
                onSort={handleSort}
                onEdit={openEdit}
                onRequestDelete={requestDelete}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
              />
              <footer className="table-pagination">
                {/* Sole announcement point for the ledger position; the bulk-selection and undo
                    statuses elsewhere in the panel announce different things. */}
                <span className="table-pagination-range" role="status">
                  {`Showing ${paginationRange.start}–${paginationRange.end} of ${page.total}`}
                  <span className="table-pagination-pages">
                    {` · Page ${page.page} of ${page.totalPages}`}
                  </span>
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
                    disabled={page.page <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
                    disabled={page.page >= page.totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </footer>
            </>
          )}
          {recentlyDeleted.length > 0 && (
            <div className="transaction-undo" role="status">
              <div>
                <strong>
                  {recentlyDeleted.length === 1
                    ? `“${recentlyDeleted[0]!.description}” deleted.`
                    : `${recentlyDeleted.length} transactions deleted.`}
                </strong>
                {undoDeleteMutation.isError && (
                  <span className="transaction-undo-error" role="alert">
                    {undoDeleteMutation.error.message}
                  </span>
                )}
              </div>
              <button
                ref={undoButtonRef}
                className="button secondary"
                type="button"
                disabled={undoDeleteMutation.isPending}
                onClick={() => undoDeleteMutation.mutate(recentlyDeleted)}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {undoDeleteMutation.isPending ? "Restoring…" : "Undo"}
              </button>
            </div>
          )}
        </section>

        {deleteMutation.isError && !pendingDelete && (
          <p className="page-error" role="alert">
            {deleteMutation.error.message}
          </p>
        )}
        <UpgradePrompt error={exportError} />
        {exportError && !isBillingEnforcementError(exportError) && (
          <p className="page-error" role="alert">
            {exportError.message}
          </p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={
            pendingDelete.items.length === 1
              ? "Delete this transaction?"
              : `Delete ${pendingDelete.items.length} transactions?`
          }
          consequence={deleteConsequence(pendingDelete.items)}
          confirmLabel={
            pendingDelete.items.length === 1
              ? "Delete transaction"
              : `Delete ${pendingDelete.items.length} transactions`
          }
          busyLabel="Deleting…"
          busy={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          returnFocus={pendingDelete.trigger}
          onConfirm={confirmDelete}
          onClose={() => {
            if (!deleteMutation.isPending) setPendingDelete(undefined);
          }}
        />
      )}

      {formOpen && (
        <TransactionForm
          workspace={workspace}
          item={editing}
          initialDraft={formDraft}
          categories={categories}
          accounts={accounts}
          debts={debts}
          busy={saveMutation.isPending}
          serverError={saveMutation.error?.message}
          onSubmit={async (input) => {
            await saveMutation.mutateAsync({ input, form: editing });
            setFormDraft(undefined);
          }}
          onClose={() => {
            if (!saveMutation.isPending) {
              setFormOpen(false);
              setEditing(undefined);
              setFormDraft(undefined);
            }
          }}
        />
      )}
      {categoryManagerOpen && (
        <CategoryManager
          workspace={workspace}
          categories={categories}
          onClose={() => setCategoryManagerOpen(false)}
        />
      )}
      <SmsQuickPasteModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
        onApply={handleApplySms}
        categories={categories}
        accounts={accounts}
        existingTransactions={page?.items}
      />
    </AppShell>
  );
}
