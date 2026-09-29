import {
  matchCategory,
  preferredTransactionAccount,
  type TransactionInput,
  type TransactionListItem,
} from "@zoption/shared";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Download,
  FolderCog,
  MessageSquare,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Tags,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { SkeletonStatus, SkeletonTableRows } from "../components/common/Skeleton";
import { CategoryManager } from "../components/transactions/CategoryManager";
import { SavedViewsBar } from "../components/transactions/SavedViewsBar";
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
import { useBulkTransactionActions } from "../hooks/useBulkTransactionActions";
import { SORT_OPTIONS, useTransactionFilters } from "../hooks/useTransactionFilters";
import { useTransactionExport } from "../hooks/useTransactionExport";
import { localIsoDate } from "../lib/calendar";
import {
  createTransaction,
  getTransactions,
  isBillingEnforcementError,
  updateTransaction,
} from "../lib/api";
import { useDefaultSpendingAccountId } from "../lib/defaultSpendingAccount";
import { formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { optimisticId, restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import {
  feedTransactions,
  optimisticTransaction,
  saveOptimisticTransaction,
  type TransactionFeed,
} from "../lib/optimisticTransactions";
import { userWorkspace } from "../lib/workspace";
import { useAccounts } from "../queries/accounts";
import { useCategories } from "../queries/categories";
import { useDebts } from "../queries/debts";
import { invalidateAfterTransactionWrite } from "../queries/transactions";
import "./TransactionsPage.css";
// SavedViewsBar.css holds the saved-view rules that used to sit in TransactionsPage.css, so it
// loads right after it to keep the cascade order.
import "../components/transactions/SavedViewsBar.css";
import { workspaceCurrency } from "../lib/workspaceCurrency";

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
  const {
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
  } = useTransactionFilters();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [formOpen, setFormOpen] = useState(() => searchParams.get("add") === "1");
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionListItem>();
  const [formDraft, setFormDraft] = useState<TransactionFormDraft>();
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    items: TransactionListItem[];
    trigger: HTMLButtonElement | null;
  }>();

  const categoriesQuery = useCategories(workspace, true);
  const accountsQuery = useAccounts(workspace);
  const debtsQuery = useDebts(workspace);
  const feedKey = queryKeys.transactionFeed(workspace, query);
  // An invalidation refetches every loaded page in sequence, so a user who has scrolled N pages
  // pays N 50-row reads after each save. Accepted: it keeps the scrolled list in place.
  const transactionsQuery = useInfiniteQuery({
    queryKey: feedKey,
    queryFn: ({ pageParam }) => getTransactions(workspace, { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });

  const feed = transactionsQuery.data;
  const items = useMemo(() => feedTransactions(feed), [feed]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const {
    selectedIds,
    setSelectedIds,
    bulkCategoryId,
    setBulkCategoryId,
    recentlyDeleted,
    setRecentlyDeleted,
    selectedItems,
    bulkCategories,
    deletingIds,
    toggleSelect,
    toggleSelectAll,
    deleteMutation,
    undoDeleteMutation,
    bulkCategoryMutation,
  } = useBulkTransactionActions({ workspace, feedKey, query, categories, items, filtersKey });
  const { exporting, exportError, handleExport } = useTransactionExport(workspace, query);

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

  const refreshProductData = async () => {
    await invalidateAfterTransactionWrite(queryClient, workspace);
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
      const snapshot = await updateOptimistically<TransactionFeed>(
        queryClient,
        feedKey,
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
      queryClient.setQueryData<TransactionFeed>(feedKey, (current) =>
        saveOptimisticTransaction(current, query, saved, context.id),
      );
    },
    onSettled: () => {
      void refreshProductData();
    },
  });

  const accounts = accountsQuery.data ?? [];
  const defaultSpendingAccountId = useDefaultSpendingAccountId();
  const debts = debtsQuery.data?.items ?? [];
  // The first page carries the freshest total; later pages may have been read before an edit.
  const total = feed?.pages[0]?.total;

  // Loads the next page as the end of the ledger nears the viewport, the way the mobile list
  // scrolls. The footer's Load more button stays as the keyboard and fallback path.
  const feedEndRef = useRef<HTMLElement>(null);
  // It stands down while any read is in flight, so it never cancels the refetch that reconciles
  // an edit, and after a failed page, so an outage cannot loop; Load more or Try again resumes.
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = transactionsQuery;
  useEffect(() => {
    const end = feedEndRef.current;
    if (
      !end ||
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchNextPageError, items.length]);

  // The confirmed delete removes the row that owned focus, so hand focus to Undo rather than
  // dropping it on <body>.
  useEffect(() => {
    if (recentlyDeleted.length === 0) return;
    if (document.activeElement !== document.body) return;
    undoButtonRef.current?.focus();
  }, [recentlyDeleted]);

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
    if (parsed.amount.trim() === "") return;
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
      amount: parsed.amount.trim(),
      date: parsed.date || localIsoDate(),
      description: parsed.merchant || "SMS Transaction",
      categoryId,
      accountId: matchedAccount?.id ?? "",
      notes,
      currency: parsed.currency === "USD" ? "USD" : matchedAccount?.currency || workspaceCurrency(),
    });
    setEditing(undefined);
    setFormOpen(true);
    setIsSmsModalOpen(false);
  };

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
                {total !== undefined
                  ? `${total} transaction${total === 1 ? "" : "s"}`
                  : "Loading transactions"}
              </strong>
              <span>
                {transactionsQuery.isFetching && feed
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
              <SavedViewsBar filters={filters} onApply={applySavedFilters} />
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
          {feed && items.length === 0 && (
            <div className="empty-transactions">
              {/* Takes over from the ledger status, which is not rendered for an empty list. */}
              <strong role="status">No transactions match these filters.</strong>
              <p>Clear the filters or add a new transaction to your workspace.</p>
              <button className="button primary" type="button" onClick={openCreate}>
                <Plus size={16} /> Add transaction
              </button>
            </div>
          )}
          {feed && items.length > 0 && (
            <>
              <TransactionTable
                items={items}
                groupByDay={query.sortBy === "date"}
                lastDayPartial={transactionsQuery.hasNextPage}
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
              <footer ref={feedEndRef} className="transaction-feed-end">
                {/* Sole announcement point for the ledger position; the bulk-selection and undo
                    statuses elsewhere in the panel announce different things. */}
                <span className="transaction-feed-status" role="status">
                  {`Showing ${items.length} of ${total ?? items.length}`}
                </span>
                {transactionsQuery.hasNextPage && (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void transactionsQuery.fetchNextPage()}
                    disabled={transactionsQuery.isFetchingNextPage}
                  >
                    {transactionsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                )}
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
        existingTransactions={items}
      />
    </AppShell>
  );
}
