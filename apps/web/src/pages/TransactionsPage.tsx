import type {
  TransactionExportQuery,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
} from "@zoption/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FolderCog, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { CategoryManager } from "../components/transactions/CategoryManager";
import { TransactionFilters } from "../components/transactions/TransactionFilters";
import { TransactionForm } from "../components/transactions/TransactionForm";
import { TransactionTable } from "../components/transactions/TransactionTable";
import { AppShell } from "../components/layout/AppShell";
import {
  createTransaction,
  deleteTransaction,
  downloadTransactions,
  getCategories,
  getAccounts,
  getTransactions,
  isBillingEnforcementError,
  updateTransaction,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
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

function normalizeSearch(value: string): string | undefined {
  return value.trim() || undefined;
}

export function TransactionsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState<TransactionListQuery>(() => ({
    ...initialQuery,
    ...readTransactionSortPreference(),
  }));
  const [searchDraft, setSearchDraft] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(() => searchParams.get("add") === "1");
  const [editing, setEditing] = useState<TransactionListItem>();
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error>();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(workspace, true),
    queryFn: () => getCategories(workspace, true),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
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

  const refreshProductData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (input: TransactionInput) =>
      editing
        ? updateTransaction(workspace, { id: editing.id, input })
        : createTransaction(workspace, input),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(undefined);
      await refreshProductData();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(workspace, id),
    onSuccess: refreshProductData,
  });

  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
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

  function openCreate() {
    setEditing(undefined);
    saveMutation.reset();
    setFormOpen(true);
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
          onSearchChange={setSearchDraft}
          onSearch={applySearchImmediately}
          onKindChange={(kind) => updateFilters({ kind, categoryId: undefined })}
          onCategoryChange={(categoryId) => updateFilters({ categoryId })}
          onAccountChange={(accountId) => updateFilters({ accountId })}
          onFromChange={(from) => updateFilters({ from })}
          onToChange={(to) => updateFilters({ to })}
          onClear={clearFilters}
        />

        <section className="transactions-panel" aria-live="polite">
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
            </div>
          </div>

          {transactionsQuery.isPending && (
            <div className="table-status">Loading transaction records…</div>
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
              <strong>No transactions match these filters.</strong>
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
                deletingId={deleteMutation.variables}
                onSort={handleSort}
                onEdit={openEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
              <footer className="table-pagination">
                <span>
                  Page {page.page} of {page.totalPages}
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
        </section>

        {deleteMutation.isError && (
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

      {formOpen && (
        <TransactionForm
          item={editing}
          categories={categories}
          accounts={accounts}
          busy={saveMutation.isPending}
          serverError={saveMutation.error?.message}
          onSubmit={async (input) => {
            await saveMutation.mutateAsync(input);
          }}
          onClose={() => {
            if (!saveMutation.isPending) {
              setFormOpen(false);
              setEditing(undefined);
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
    </AppShell>
  );
}
