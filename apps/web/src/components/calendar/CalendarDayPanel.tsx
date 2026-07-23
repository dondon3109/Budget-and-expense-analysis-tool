import type { TransactionListItem } from "@budget/shared";
import { Plus } from "lucide-react";

import { formatCalendarDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";

interface CalendarDayPanelProps {
  date: string;
  items: TransactionListItem[];
  onAddTransaction: () => void;
}

export function CalendarDayPanel({ date, items, onAddTransaction }: CalendarDayPanelProps) {
  return (
    <aside className="calendar-day-panel" aria-labelledby="calendar-day-title">
      <header className="calendar-day-heading" aria-live="polite">
        <div>
          <p className="eyebrow">Selected day</p>
          <h2 id="calendar-day-title">{formatCalendarDate(date)}</h2>
          <span>
            {items.length} transaction{items.length === 1 ? "" : "s"}
          </span>
        </div>
        <button className="button secondary compact" type="button" onClick={onAddTransaction}>
          <Plus size={15} aria-hidden="true" /> Add
        </button>
      </header>

      {items.length === 0 ? (
        <div className="calendar-day-empty">
          <strong>No activity on this day.</strong>
          <p>Add a transaction and its daily summary will appear here.</p>
          <button className="button primary" type="button" onClick={onAddTransaction}>
            <Plus size={16} aria-hidden="true" /> Add transaction
          </button>
        </div>
      ) : (
        <div className="calendar-transaction-list">
          {items.map((item) => (
            <article className="calendar-transaction" key={item.id}>
              <div className="transaction-description">
                <strong>{item.description}</strong>
                <span>
                  {item.accountName}
                  {item.notes ? ` · ${item.notes}` : ""}
                </span>
              </div>
              <span className="category-chip">
                <i style={{ backgroundColor: item.categoryColor }} />
                {item.categoryName}
              </span>
              <span className={`kind-badge ${item.kind}`}>
                {item.kind === "income"
                  ? "Money in"
                  : item.kind === "expense"
                    ? "Money out"
                    : "Transfer"}
              </span>
              <strong className={`calendar-transaction-amount amount-${item.kind}`}>
                {item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}
                {formatMoney(Math.abs(item.amountMinor))}
              </strong>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
