import { currencies } from "@zoption/shared";

import type { CalendarCell } from "../calendar/calendar-month-grid";
import type { TransactionDateGroup } from "./transaction-list-view";

/** Grid cells for the Transactions calendar: each day's income and spending. */
export function calendarCellsFromTransactions(
  groups: readonly TransactionDateGroup[],
): Map<string, CalendarCell> {
  return new Map(
    groups.map((group) => {
      const populated = currencies.filter((currency) => group.totals[currency] !== undefined);
      const totals = populated.length === 1 ? group.totals[populated[0]!] : undefined;
      return [
        group.date,
        {
          incomeMinor: totals?.incomeMinor ?? 0,
          expenseMinor: totals?.expenseMinor ?? 0,
          mixedCurrency: populated.length > 1,
          summary: group.items.length
            ? [`${group.items.length} transaction${group.items.length === 1 ? "" : "s"}`]
            : [],
        },
      ];
    }),
  );
}
