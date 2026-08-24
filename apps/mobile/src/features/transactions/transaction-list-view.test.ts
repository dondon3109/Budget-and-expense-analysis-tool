import type { TransactionListItem } from "@zoption/shared";

import type { LocalTransactionItem } from "@/db/repository";
import {
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

  it("shifts month starts and formats date identities without timezone drift", () => {
    expect(shiftMonthStart("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonthStart("2026-12-01", 1)).toBe("2027-01-01");
    expect(monthStartForDate(new Date(2026, 7, 24))).toBe("2026-08-01");
    expect(transactionDayLabel("2026-08-24")).toEqual({ day: "24", weekday: "Mon" });
  });
});
