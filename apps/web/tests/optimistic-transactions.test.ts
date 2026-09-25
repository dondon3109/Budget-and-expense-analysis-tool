import type { TransactionListItem, TransactionListQuery, TransactionPage } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import {
  deleteOptimisticTransaction,
  feedTransactions,
  saveOptimisticTransaction,
  transactionMatchesQuery,
  type TransactionFeed,
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

function feedOf(...pages: TransactionPage[]): TransactionFeed {
  return { pages, pageParams: pages.map((entry) => entry.page) };
}

function ids(feed: TransactionFeed | undefined): string[] {
  return feedTransactions(feed).map((row) => row.id);
}

describe("optimistic transaction lists", () => {
  it("inserts a matching creation and updates pagination totals", () => {
    const next = saveOptimisticTransaction(feedOf(page), query, item);
    expect(next?.pages[0]).toMatchObject({ items: [item], total: 1, totalPages: 1 });
  });

  it("keeps same-date rows in the API's newest-created-first order", () => {
    const older = { ...item, id: "transaction-older", createdAt: "2026-08-26 08:00:00" };
    const newer = { ...item, id: "transaction-newer", createdAt: "2026-08-26 09:00:00" };
    const pending = {
      ...item,
      id: "optimistic:transaction:1",
      createdAt: "2026-08-26 10:00:00",
    };

    const next = saveOptimisticTransaction(
      feedOf({ ...page, items: [newer, older], total: 2 }),
      query,
      pending,
    );

    expect(ids(next)).toEqual([
      "optimistic:transaction:1",
      "transaction-newer",
      "transaction-older",
    ]);
  });

  it("leaves an edited row where the API created it", () => {
    const oldest = { ...item, id: "transaction-oldest", createdAt: "2026-08-26 07:00:00" };
    const newest = { ...item, id: "transaction-newest", createdAt: "2026-08-26 09:00:00" };
    const edited = { ...item, id: "transaction-oldest", createdAt: oldest.createdAt };

    const next = saveOptimisticTransaction(
      feedOf({ ...page, items: [newest, oldest], total: 2 }),
      query,
      edited,
      oldest.id,
    );

    expect(ids(next)).toEqual(["transaction-newest", "transaction-oldest"]);
  });

  it("ranks amounts by magnitude the way the API's ABS() ordering does", () => {
    const expense = {
      ...item,
      id: "transaction-expense",
      amountMinor: -5_000,
      createdAt: "2026-08-26 09:00:00",
    };
    const income = {
      ...item,
      id: "transaction-income",
      amountMinor: 4_000,
      createdAt: "2026-08-26 10:00:00",
    };
    const small = {
      ...item,
      id: "transaction-small",
      amountMinor: 100,
      createdAt: "2026-08-26 11:00:00",
    };

    const next = saveOptimisticTransaction(
      feedOf({ ...page, items: [expense, income], total: 2 }),
      { ...query, sortBy: "amount" as const, sortDirection: "desc" as const },
      small,
    );

    expect(ids(next)).toEqual(["transaction-expense", "transaction-income", "transaction-small"]);
  });

  it("removes an edited transaction when it no longer matches the active filter", () => {
    const filteredQuery = { ...query, kind: "income" as const };
    const current = feedOf({ ...page, items: [item], total: 1 });

    expect(
      saveOptimisticTransaction(current, filteredQuery, item, item.id)?.pages[0],
    ).toMatchObject({ items: [], total: 0 });
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
    const current = feedOf({ ...page, items: [item], total: 1 });
    expect(deleteOptimisticTransaction(current, item.id)?.pages[0]).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it("inserts into the loaded page the row sorts into", () => {
    const newest = { ...item, id: "newest", date: "2026-08-28" };
    const middle = { ...item, id: "middle", date: "2026-08-20" };
    const oldest = { ...item, id: "oldest", date: "2026-08-10" };
    const current = feedOf(
      { ...page, items: [newest], pageSize: 1, total: 3, totalPages: 3 },
      { ...page, page: 2, items: [middle], pageSize: 1, total: 3, totalPages: 3 },
    );

    const next = saveOptimisticTransaction(current, query, {
      ...item,
      id: "new",
      date: "2026-08-25",
    });
    expect(ids(next)).toEqual(["newest", "new", "middle"]);
    expect(next?.pages[0]?.total).toBe(4);

    // Older than everything loaded while more pages remain: the next page read brings it.
    const unloaded = saveOptimisticTransaction(current, query, { ...oldest, id: "older" });
    expect(ids(unloaded)).toEqual(["newest", "middle"]);
    expect(unloaded?.pages[0]?.total).toBe(3);
  });

  it("drops a row repeated across an offset page boundary", () => {
    const current = feedOf(
      { ...page, items: [item] },
      { ...page, page: 2, items: [item, { ...item, id: "transaction-2" }] },
    );
    expect(ids(current)).toEqual(["transaction-1", "transaction-2"]);
  });
});
