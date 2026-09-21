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

export function saveOptimisticTransaction(
  page: TransactionPage | undefined,
  query: TransactionListQuery,
  item: TransactionListItem,
  previousId?: string,
): TransactionPage | undefined {
  if (!page) return page;
  const id = previousId ?? item.id;
  const existed = page.items.some((candidate) => candidate.id === id);
  const items = page.items.filter((candidate) => candidate.id !== id);
  const shouldInsert = transactionMatchesQuery(item, query) && (existed || query.page === 1);
  if (shouldInsert) items.push(item);
  items.sort((left, right) => compareTransactions(left, right, query));

  const total = Math.max(
    0,
    page.total + (existed && !shouldInsert ? -1 : !existed && shouldInsert ? 1 : 0),
  );
  return {
    ...page,
    items: items.slice(0, page.pageSize),
    total,
    totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
  };
}

export function deleteOptimisticTransaction(
  page: TransactionPage | undefined,
  id: string,
): TransactionPage | undefined {
  if (!page || !page.items.some((item) => item.id === id)) return page;
  const total = Math.max(0, page.total - 1);
  return {
    ...page,
    items: page.items.filter((item) => item.id !== id),
    total,
    totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
  };
}
