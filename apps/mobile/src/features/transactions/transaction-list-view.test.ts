import type { TransactionListItem } from "@zoption/shared";

import type { LocalTransactionItem } from "@/db/view-models";
import {
  categorySummary,
  compactAmountLabel,
  groupTransactionsByDate,
  monthStartForDate,
  shiftMonthStart,
  summarizeTransactions,
  transactionDayLabel,
} from "./transaction-list-view";

function item(
  id: string,
  date: string,
  amountMinor: number,
  kind: TransactionListItem["kind"],
  currency: TransactionListItem["currency"] = "PHP",
): LocalTransactionItem {
  return {
    syncState: "synced",
    transaction: {
      id,
      date,
      description: id,
      amountMinor,
      currency,
      kind,
      categoryId: "category-1",
      categoryName: "Category",
      categoryColor: "#123456",
      accountId: "account-1",
      accountName: "Wallet",
      notes: null,
    },
  };
}

describe("transaction list view", () => {
  it("groups transactions by newest date and calculates each day independently", () => {
    const groups = groupTransactionsByDate([
      item("older-expense", "2026-08-13", -2_500, "expense"),
      item("new-income", "2026-08-24", 10_000, "income"),
      item("new-expense", "2026-08-24", -3_000, "expense"),
    ]);

    expect(groups.map((group) => group.date)).toEqual(["2026-08-24", "2026-08-13"]);
    expect(groups[0]?.items.map((entry) => entry.transaction.id)).toEqual([
      "new-income",
      "new-expense",
    ]);
    expect(groups[0]?.totals.PHP).toEqual({
      incomeMinor: 10_000,
      expenseMinor: 3_000,
      netMinor: 7_000,
    });
  });

  it("keeps currencies separate and excludes transfers from income and expense totals", () => {
    const totals = summarizeTransactions([
      item("php-income", "2026-08-24", 12_000, "income"),
      item("usd-expense", "2026-08-24", -500, "expense", "USD"),
      item("transfer", "2026-08-24", 4_000, "transfer"),
    ]);

    expect(totals.PHP).toEqual({ incomeMinor: 12_000, expenseMinor: 0, netMinor: 12_000 });
    expect(totals.USD).toEqual({ incomeMinor: 0, expenseMinor: 500, netMinor: -500 });
  });

  it("leaves the opening balance out of income totals, as the web app does", () => {
    const opening = item("opening", "2026-08-24", 50_000, "income");
    opening.transaction.categorySystemKey = "opening:income";
    const totals = summarizeTransactions([opening, item("salary", "2026-08-24", 12_000, "income")]);

    expect(totals.PHP).toEqual({ incomeMinor: 12_000, expenseMinor: 0, netMinor: 12_000 });
    expect(categorySummary([opening])[0]?.incomeMinor).toBe(0);
  });

  it("shifts month starts and formats date identities without timezone drift", () => {
    expect(shiftMonthStart("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonthStart("2026-12-01", 1)).toBe("2027-01-01");
    expect(monthStartForDate(new Date(2026, 7, 24))).toBe("2026-08-01");
    expect(transactionDayLabel("2026-08-24")).toEqual({ day: "24", weekday: "Mon" });
  });

  it("summarizes each category and currency with absolute totals, largest first", () => {
    const inCategory = (
      entry: LocalTransactionItem,
      categoryId: string,
      categoryName: string,
    ): LocalTransactionItem => ({
      ...entry,
      transaction: { ...entry.transaction, categoryId, categoryName },
    });
    const rows = categorySummary([
      inCategory(item("lunch", "2026-08-24", -3_000, "expense"), "food", "Food"),
      inCategory(item("dinner", "2026-08-24", -2_000, "expense"), "food", "Food"),
      inCategory(item("refund", "2026-08-24", 1_000, "income"), "food", "Food"),
      inCategory(item("usd-lunch", "2026-08-24", -500, "expense", "USD"), "food", "Food"),
      inCategory(item("move", "2026-08-24", -6_000, "transfer"), "transfer", "Transfer"),
      inCategory(item("bus", "2026-08-24", -500, "expense"), "transit", "Bus"),
    ]);

    expect(
      rows.map(({ key, incomeMinor, expenseMinor, transferMinor }) => ({
        key,
        incomeMinor,
        expenseMinor,
        transferMinor,
      })),
    ).toEqual([
      { key: "food:PHP", incomeMinor: 1_000, expenseMinor: 5_000, transferMinor: 0 },
      { key: "transfer:PHP", incomeMinor: 0, expenseMinor: 0, transferMinor: 6_000 },
      // Equal totals fall back to the category name.
      { key: "transit:PHP", incomeMinor: 0, expenseMinor: 500, transferMinor: 0 },
      { key: "food:USD", incomeMinor: 0, expenseMinor: 500, transferMinor: 0 },
    ]);
  });
});

describe("compactAmountLabel", () => {
  it("shortens whole-unit amounts for calendar cells", () => {
    expect(compactAmountLabel(85_000)).toBe("850");
    expect(compactAmountLabel(-210_000)).toBe("2.1k");
    expect(compactAmountLabel(1_200_000)).toBe("12k");
    expect(compactAmountLabel(150_000_000)).toBe("1.5M");
    expect(compactAmountLabel(99)).toBe("0");
  });
});
