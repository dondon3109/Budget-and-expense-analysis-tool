import type { SubscriptionMonthItem, TransactionListItem } from "@zoption/shared";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Repeat2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { firstWeekday, formatCalendarDate, monthDates } from "../../lib/calendar";

export interface CalendarDayData {
  items: TransactionListItem[];
  subscriptions: SubscriptionMonthItem[];
  incomeMinor: number;
  expenseMinor: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
}

interface CalendarMonthGridProps {
  month: string;
  selectedDate: string;
  today: string;
  days: ReadonlyMap<string, CalendarDayData>;
  onSelectDate: (date: string) => void;
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const compactMoney = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});

function dayLabel(
  date: string,
  data?: CalendarDayData,
  selected?: boolean,
  today?: boolean,
): string {
  const parts = [formatCalendarDate(date)];
  if (today) parts.push("today");
  if (selected) parts.push("selected");
  if (data?.incomeCount) {
    parts.push(
      `${data.incomeCount} money in transaction${data.incomeCount === 1 ? "" : "s"} totaling ${compactMoney.format(data.incomeMinor / 100)}`,
    );
  }
  if (data?.expenseCount) {
    parts.push(
      `${data.expenseCount} money out transaction${data.expenseCount === 1 ? "" : "s"} totaling ${compactMoney.format(data.expenseMinor / 100)}`,
    );
  }
  if (data?.transferCount) {
    parts.push(`${data.transferCount} transfer${data.transferCount === 1 ? "" : "s"}`);
  }
  if (data?.subscriptions.length) {
    parts.push(
      `${data.subscriptions.length} subscription${data.subscriptions.length === 1 ? "" : "s"}: ${data.subscriptions.map((subscription) => subscription.name).join(", ")}`,
    );
  }
  return parts.join(", ");
}

export function CalendarMonthGrid({
  month,
  selectedDate,
  today,
  days,
  onSelectDate,
}: CalendarMonthGridProps) {
  const dates = monthDates(month);
  const leadingCells = firstWeekday(month);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const index = dates.indexOf(date);
    let target = index;
    if (event.key === "ArrowLeft") target -= 1;
    else if (event.key === "ArrowRight") target += 1;
    else if (event.key === "ArrowUp") target -= 7;
    else if (event.key === "ArrowDown") target += 7;
    else if (event.key === "Home") target -= (leadingCells + index) % 7;
    else if (event.key === "End") target += 6 - ((leadingCells + index) % 7);
    else return;

    event.preventDefault();
    const targetDate = dates[Math.max(0, Math.min(dates.length - 1, target))];
    if (!targetDate) return;
    onSelectDate(targetDate);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-calendar-date="${targetDate}"]`)?.focus();
    });
  }

  return (
    <div className="calendar-grid" role="grid" aria-label={`Calendar for ${month}`}>
      {weekdays.map((weekday) => (
        <div className="calendar-weekday" role="columnheader" key={weekday} title={weekday}>
          <span aria-hidden="true">{weekday.slice(0, 3)}</span>
          <span className="sr-only">{weekday}</span>
        </div>
      ))}
      {Array.from({ length: leadingCells }, (_, index) => (
        <div className="calendar-day-placeholder" role="gridcell" key={`leading-${index}`} />
      ))}
      {dates.map((date) => {
        const data = days.get(date);
        const selected = date === selectedDate;
        const isToday = date === today;
        return (
          <div className="calendar-day-cell" role="gridcell" key={date}>
            <button
              type="button"
              className={`calendar-day${selected ? " selected" : ""}${isToday ? " today" : ""}`}
              data-calendar-date={date}
              aria-label={dayLabel(date, data, selected, isToday)}
              aria-pressed={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelectDate(date)}
              onKeyDown={(event) => handleKeyDown(event, date)}
            >
              <span className="calendar-day-number">
                {Number(date.slice(-2))}
                {isToday && <small>Today</small>}
              </span>
              <span className="calendar-day-indicators">
                {data?.incomeCount ? (
                  <span className="calendar-indicator income">
                    <ArrowDownRight size={12} aria-hidden="true" />+
                    {compactMoney.format(data.incomeMinor / 100)}
                  </span>
                ) : null}
                {data?.expenseCount ? (
                  <span className="calendar-indicator expense">
                    <ArrowUpRight size={12} aria-hidden="true" />−
                    {compactMoney.format(data.expenseMinor / 100)}
                  </span>
                ) : null}
                {data?.transferCount ? (
                  <span className="calendar-indicator transfer">
                    <Repeat2 size={11} aria-hidden="true" /> {data.transferCount}
                  </span>
                ) : null}
                {data?.subscriptions.map((subscription) => (
                  <span
                    className={`calendar-indicator subscription ${date <= today ? "paid" : "due"}`}
                    key={subscription.id}
                    title={`${subscription.name} · ${date <= today ? "Paid" : "Upcoming"}`}
                  >
                    <CalendarClock size={11} aria-hidden="true" /> {subscription.name}
                  </span>
                ))}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
