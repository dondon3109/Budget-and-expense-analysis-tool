import type { TransactionListItem, TransactionListQuery, TransactionPage } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import {
  deleteOptimisticTransaction,
  saveOptimisticTransaction,
  transactionMatchesQuery,
} from "../src/lib/optimisticTransactions";

const item: TransactionListItem = {
  id: "transaction-1",
  date: "2026-08-26",
  description: "Groceries",
  amountMinor: 2500,
  currency: "PHP",
  kind: "expense",
  categoryId: "category-1",
  categoryName: "Food",
  categoryColor: "#008300",
  accountId: "account-1",
  accountName: "Cash",
  notes: null,
};
const query: TransactionListQuery = {
  page: 1,
  pageSize: 10,
  sortBy: "date",
  sortDirection: "desc",
};
const page: TransactionPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

describe("optimistic transaction lists", () => {
  it("inserts a matching creation and updates pagination totals", () => {
    expect(saveOptimisticTransaction(page, query, item)).toMatchObject({
      items: [item],
      total: 1,
      totalPages: 1,
    });
  });

  it("removes an edited transaction when it no longer matches the active filter", () => {
    const filteredQuery = { ...query, kind: "income" as const };
    const current = { ...page, items: [item], total: 1 };

    expect(saveOptimisticTransaction(current, filteredQuery, item, item.id)).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it("matches account filters against both sides of a transfer", () => {
    const transfer = {
      ...item,
      kind: "transfer" as const,
      accountId: null,
      fromAccountId: "account-1",
      toAccountId: "account-2",
    };

    expect(transactionMatchesQuery(transfer, { ...query, accountId: "account-2" })).toBe(true);
  });

  it("removes a deleted row immediately", () => {
    const current = { ...page, items: [item], total: 1 };
    expect(deleteOptimisticTransaction(current, item.id)).toMatchObject({ items: [], total: 0 });
  });
});
