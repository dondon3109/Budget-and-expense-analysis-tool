import { groupTransactionsByDate } from "./transaction-list-view";
import { calendarCellsFromTransactions } from "./transaction-calendar-cells";
import type { LocalTransactionItem } from "@/db/view-models";

function item(
  id: string,
  date: string,
  currency: "PHP" | "USD",
  amountMinor: number,
  kind: "income" | "expense",
) {
  return {
    transaction: { id, date, currency, amountMinor, kind, description: id },
  } as unknown as LocalTransactionItem;
}

describe("calendarCellsFromTransactions", () => {
  it("totals a single-currency day and counts its transactions", () => {
    const cells = calendarCellsFromTransactions(
      groupTransactionsByDate([
        item("a", "2026-08-05", "PHP", 500_000, "income"),
        item("b", "2026-08-05", "PHP", -45_000, "expense"),
      ]),
    );

    expect(cells.get("2026-08-05")).toMatchObject({
      incomeMinor: 500_000,
      expenseMinor: 45_000,
      mixedCurrency: false,
      summary: ["2 transactions"],
    });
  });

  it("marks a day in several currencies instead of adding them up", () => {
    const cells = calendarCellsFromTransactions(
      groupTransactionsByDate([
        item("a", "2026-08-05", "PHP", -45_000, "expense"),
        item("b", "2026-08-05", "USD", -1_000, "expense"),
      ]),
    );

    expect(cells.get("2026-08-05")).toMatchObject({ mixedCurrency: true, expenseMinor: 0 });
  });
});
