import type {
  AccountRecord,
  CategoryRecord,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
} from "@zoption/shared";

function compareTransactions(
  left: TransactionListItem,
  right: TransactionListItem,
  query: TransactionListQuery,
): number {
  let result: number;
  if (query.sortBy === "amount") result = left.amountMinor - right.amountMinor;
  else if (query.sortBy === "description")
    result = left.description.localeCompare(right.description);
  else result = left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
  return query.sortDirection === "asc" ? result : -result;
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

export function optimisticTransaction(
  id: string,
  input: TransactionInput,
  categories: readonly CategoryRecord[],
  accounts: readonly AccountRecord[],
): TransactionListItem {
  const category = categories.find((item) => item.id === input.categoryId);
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
    accountName:
      account?.name ??
      (fromAccount && toAccount ? `${fromAccount.name} → ${toAccount.name}` : "Account"),
    notes: input.notes ?? null,
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
