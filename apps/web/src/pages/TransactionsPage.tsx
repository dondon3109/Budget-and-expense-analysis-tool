import type {
  TransactionExportQuery,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
} from "@budget/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FolderCog, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthProvider";
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
  updateTransaction,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

const initialQuery: TransactionListQuery = {
  page: 1,
  pageSize: 10,
  sortBy: "date",
  sortDirection: "desc",
};

export function TransactionsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState<TransactionListQuery>(initialQuery);
  const [searchDraft, setSearchDraft] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionListItem>();
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

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

  const refreshProductData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
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

  function updateFilters(change: Partial<TransactionListQuery>) {
    setQuery((current) => ({ ...current, ...change, page: 1 }));
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

  function handleSort(sortBy: TransactionListQuery["sortBy"]) {
    setQuery((current) => ({
      ...current,
      page: 1,
      sortBy,
      sortDirection: current.sortBy === sortBy && current.sortDirection === "desc" ? "asc" : "desc",
    }));
  }

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
      setExportError(error instanceof Error ? error.message : "The export could not be prepared.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell mode="user">
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
          onSearchChange={setSearchDraft}
          onSearch={() => updateFilters({ search: searchDraft || undefined })}
          onKindChange={(kind) => updateFilters({ kind, categoryId: undefined })}
          onCategoryChange={(categoryId) => updateFilters({ categoryId })}
          onAccountChange={(accountId) => updateFilters({ accountId })}
          onFromChange={(from) => updateFilters({ from })}
          onToChange={(to) => updateFilters({ to })}
          onClear={() => {
            setSearchDraft("");
            setQuery(initialQuery);
          }}
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
            <button
              className="refresh-button"
              type="button"
              onClick={() => void transactionsQuery.refetch()}
              disabled={transactionsQuery.isFetching}
            >
              <RefreshCw size={15} className={transactionsQuery.isFetching ? "spinning" : ""} />{" "}
              Refresh
            </button>
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
        {exportError && (
          <p className="page-error" role="alert">
            {exportError}
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
