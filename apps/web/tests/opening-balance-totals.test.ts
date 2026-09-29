import { OPENING_BALANCE_CATEGORY_SYSTEM_KEY, type TransactionListItem } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { groupTransactionsByDay } from "../src/transactions/dayGroups";

function item(overrides: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: "t",
    date: "2026-09-29",
    description: "Fixture",
    amountMinor: 100_00,
    currency: "PHP",
    kind: "income",
    categoryId: "salary",
    categoryName: "Salary",
    categoryColor: "#2a78d6",
    accountName: "Cash",
    accountId: "cash",
    notes: null,
    ...overrides,
  };
}

describe("opening balance in day totals", () => {
  it("lists the entry but leaves it out of the day's income", () => {
    const groups = groupTransactionsByDay([
      item({
        id: "opening",
        amountMinor: 50_000_00,
        categorySystemKey: OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
      }),
      item({ id: "salary" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[0]?.totals.PHP).toEqual({ incomeMinor: 100_00, expenseMinor: 0 });
  });
});
