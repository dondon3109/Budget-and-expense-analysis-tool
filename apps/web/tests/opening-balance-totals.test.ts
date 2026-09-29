import { OPENING_BALANCE_CATEGORY_SYSTEM_KEY, type TransactionListItem } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { buildCalendarDays } from "../src/pages/CalendarPage";
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

describe("opening balance on the calendar", () => {
  it("lists the entry on its day without adding it to the day's income", () => {
    const days = buildCalendarDays(
      [
        item({
          id: "opening",
          amountMinor: 50_000_00,
          categorySystemKey: OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
        }),
        item({ id: "salary" }),
      ],
      [],
      [],
    );

    const day = days.get("2026-09-29");
    expect(day?.items).toHaveLength(2);
    expect(day?.incomeByCurrency.PHP).toBe(100_00);
    expect(day?.incomeCount).toBe(1);
    expect(day?.transferCount).toBe(0);
  });
});
