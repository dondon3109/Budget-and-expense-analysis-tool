import type { InfiniteData } from "@tanstack/react-query";
import type {
  AccountRecord,
  CategoryRecord,
  Debt,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
} from "@zoption/shared";

/**
 * Mirrors the API's ORDER BY: the chosen column carries the sort direction, then
 * date, creation time and id always break ties newest first. An optimistic row
 * then lands where the next page read would put it instead of jumping around.
 */
function compareTransactions(
  left: TransactionListItem,
  right: TransactionListItem,
  query: TransactionListQuery,
): number {
  const direction = query.sortDirection === "asc" ? 1 : -1;
  const primary =
    query.sortBy === "amount"
      ? Math.abs(left.amountMinor) - Math.abs(right.amountMinor)
      : query.sortBy === "description"
        ? left.description.localeCompare(right.description)
        : left.date.localeCompare(right.date);
  if (primary !== 0) return primary * direction;
  return (
    right.date.localeCompare(left.date) ||
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
    right.id.localeCompare(left.id)
  );
}

export function transactionMatchesQuery(
  item: TransactionListItem,
  query: TransactionListQuery,
): boolean {
  const search = query.search?.trim().toLocaleLowerCase();
  return !(
    (search &&
      !`${item.description} ${item.categoryName} ${item.accountName}`
        .toLocaleLowerCase()
        .includes(search)) ||
    (query.accountId &&
      item.accountId !== query.accountId &&
      item.fromAccountId !== query.accountId &&
      item.toAccountId !== query.accountId) ||
    (query.categoryId && item.categoryId !== query.categoryId) ||
    (query.kind && item.kind !== query.kind) ||
    (query.from && item.date < query.from) ||
    (query.to && item.date > query.to)
  );
}

/**
 * Stands in for the API's `created_at` while a save is in flight, in the same
 * `datetime('now')` shape so a pending row compares against server rows directly.
 */
function pendingCreatedAt(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function optimisticTransaction(
  id: string,
  input: TransactionInput,
  categories: readonly CategoryRecord[],
  accounts: readonly AccountRecord[],
  debts: readonly Debt[],
  createdAt: string = pendingCreatedAt(),
): TransactionListItem {
  const category = categories.find((item) => item.id === input.categoryId);
  const debtId = input.kind === "expense" ? (input.debtId ?? null) : null;
  const debt = debts.find((item) => item.id === debtId);
  const account =
    "accountId" in input ? accounts.find((item) => item.id === input.accountId) : undefined;
  const fromAccount =
    "fromAccountId" in input ? accounts.find((item) => item.id === input.fromAccountId) : undefined;
  const toAccount =
    "toAccountId" in input ? accounts.find((item) => item.id === input.toAccountId) : undefined;

  return {
    id,
    date: input.date,
    description: input.description || "Transfer",
    amountMinor: input.amountMinor,
    currency: input.currency,
    kind: input.kind,
    categoryId: input.categoryId,
    categoryName: category?.name ?? "Category",
    categoryColor: category?.color ?? "#64748b",
    categoryIconEmoji: category?.iconEmoji ?? null,
    accountId: account?.id ?? null,
    debtId,
    debtName: debt?.name ?? null,
    accountName:
      account?.name ??
      (fromAccount && toAccount ? `${fromAccount.name} → ${toAccount.name}` : "Account"),
    notes: input.notes ?? null,
    createdAt,
    transferGroupId: null,
    fromAccountId: fromAccount?.id ?? null,
    fromAccountName: fromAccount?.name ?? null,
    toAccountId: toAccount?.id ?? null,
    toAccountName: toAccount?.name ?? null,
    transferFeeMinor: "transferFeeMinor" in input ? (input.transferFeeMinor ?? 0) : null,
  };
}

/** The Transactions page's infinite ledger: one entry per loaded API page. */
export type TransactionFeed = InfiniteData<TransactionPage>;

function withTotal(page: TransactionPage, total: number): TransactionPage {
  return { ...page, total, totalPages: Math.max(1, Math.ceil(total / page.pageSize)) };
}

/**
 * Places a saved row in the loaded page it sorts into. A row that sorts past everything
 * loaded is left for the next page read, unless the ledger is fully loaded.
 */
export function saveOptimisticTransaction(
  feed: TransactionFeed | undefined,
  query: TransactionListQuery,
  item: TransactionListItem,
  previousId?: string,
): TransactionFeed | undefined {
  if (!feed || feed.pages.length === 0) return feed;
  const id = previousId ?? item.id;
  const existed = feed.pages.some((page) => page.items.some((candidate) => candidate.id === id));
  const pages = feed.pages.map((page) => ({
    ...page,
    items: page.items.filter((candidate) => candidate.id !== id),
  }));

  let inserted = false;
  if (transactionMatchesQuery(item, query)) {
    const lastPage = pages[pages.length - 1]!;
    const fullyLoaded = lastPage.page >= lastPage.totalPages;
    const index = pages.findIndex((page) =>
      page.items.some((candidate) => compareTransactions(item, candidate, query) < 0),
    );
    const target = index === -1 && fullyLoaded ? pages.length - 1 : index;
    if (target !== -1) {
      const page = pages[target]!;
      pages[target] = {
        ...page,
        items: [...page.items, item].sort((left, right) => compareTransactions(left, right, query)),
      };
      inserted = true;
    }
  }

  const delta = existed && !inserted ? -1 : !existed && inserted ? 1 : 0;
  return {
    ...feed,
    pages: pages.map((page) => withTotal(page, Math.max(0, page.total + delta))),
  };
}

export function deleteOptimisticTransaction(
  feed: TransactionFeed | undefined,
  id: string,
): TransactionFeed | undefined {
  if (!feed?.pages.some((page) => page.items.some((item) => item.id === id))) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) =>
      withTotal(
        { ...page, items: page.items.filter((item) => item.id !== id) },
        Math.max(0, page.total - 1),
      ),
    ),
  };
}

export function mapFeedTransactions(
  feed: TransactionFeed | undefined,
  update: (item: TransactionListItem) => TransactionListItem,
): TransactionFeed | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({ ...page, items: page.items.map(update) })),
  };
}

/**
 * Flattens the loaded pages. Offset paging can repeat a row at a page boundary when the
 * ledger changes between reads, so the first occurrence wins.
 */
export function feedTransactions(feed: TransactionFeed | undefined): TransactionListItem[] {
  const seen = new Set<string>();
  const items: TransactionListItem[] = [];
  for (const page of feed?.pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}
