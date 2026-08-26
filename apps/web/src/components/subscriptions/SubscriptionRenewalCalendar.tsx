import type { SubscriptionMonthItem } from "@zoption/shared";
import {
  ArrowDownRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Pencil,
  Repeat2,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { firstWeekday, formatCalendarDate, localIsoDate, monthDates } from "../../lib/calendar";
import { formatFullMonth, formatMoney } from "../../lib/formatters";
import "./SubscriptionRenewalCalendar.css";

interface SubscriptionRenewalCalendarProps {
  month: string;
  items: SubscriptionMonthItem[];
  onEdit: (item: SubscriptionMonthItem) => void;
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatScheduleDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function relativeRenewalLabel(billingDate: string, today: string): string {
  if (billingDate === today) return "Due today";
  if (billingDate < today) return `Paid · ${formatScheduleDate(billingDate)}`;
  const daysDiff = Math.round(
    (new Date(`${billingDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (daysDiff === 1) return "Due tomorrow";
  return `Due in ${daysDiff} days`;
}

export function SubscriptionRenewalCalendar({
  month,
  items,
  onEdit,
}: SubscriptionRenewalCalendarProps) {
  const today = localIsoDate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dates = useMemo(() => monthDates(month), [month]);
  const leadingCells = useMemo(() => firstWeekday(month), [month]);

  // Active subscriptions scheduled to renew in this visible month
  const activeBilledItems = useMemo(
    () =>
      items
        .filter((item) => item.status === "active" && item.billingDate !== null)
        .sort((a, b) => (a.billingDate ?? "").localeCompare(b.billingDate ?? "")),
    [items],
  );

  // Group renewals by billing date
  const renewalsByDate = useMemo(() => {
    const map = new Map<string, SubscriptionMonthItem[]>();
    for (const item of activeBilledItems) {
      if (!item.billingDate) continue;
      const list = map.get(item.billingDate) ?? [];
      list.push(item);
      map.set(item.billingDate, list);
    }
    return map;
  }, [activeBilledItems]);

  // Cash-flow impact metrics
  const totalBilledMinor = useMemo(
    () => activeBilledItems.reduce((sum, item) => sum + item.amountMinor, 0),
    [activeBilledItems],
  );

  const paidMinor = useMemo(
    () =>
      activeBilledItems
        .filter((item) => item.billingDate! <= today)
        .reduce((sum, item) => sum + item.amountMinor, 0),
    [activeBilledItems, today],
  );

  const upcomingOutflowMinor = useMemo(
    () =>
      activeBilledItems
        .filter((item) => item.billingDate! > today)
        .reduce((sum, item) => sum + item.amountMinor, 0),
    [activeBilledItems, today],
  );

  const unbilledActiveItems = useMemo(
    () => items.filter((item) => item.status === "active" && item.billingDate === null),
    [items],
  );

  // Subscriptions to display in the schedule timeline
  const displayedScheduleItems = useMemo(() => {
    if (!selectedDate) return activeBilledItems;
    return activeBilledItems.filter((item) => item.billingDate === selectedDate);
  }, [activeBilledItems, selectedDate]);

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
    setSelectedDate(targetDate);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-renewal-calendar-date="${targetDate}"]`)
        ?.focus();
    });
  }

  return (
    <div className="renewal-calendar-interface" aria-label="Visual Renewal Calendar Interface">
      {/* 1. Cash-Flow Impact Summary */}
      <section className="renewal-impact-summary" aria-label="Cash flow impact summary">
        <div className="renewal-stat-card total">
          <div className="stat-card-header">
            <span className="stat-card-icon">
              <Repeat2 size={16} aria-hidden="true" />
            </span>
            <span className="stat-card-title">Total outflow this month</span>
          </div>
          <strong className="stat-card-value">{formatMoney(totalBilledMinor)}</strong>
          <span className="stat-card-caption">
            {activeBilledItems.length} renewal{activeBilledItems.length === 1 ? "" : "s"} scheduled
            in {formatFullMonth(month)}
          </span>
        </div>

        <div className="renewal-stat-card paid">
          <div className="stat-card-header">
            <span className="stat-card-icon paid">
              <CheckCircle2 size={16} aria-hidden="true" />
            </span>
            <span className="stat-card-title">Paid to date</span>
          </div>
          <strong className="stat-card-value">{formatMoney(paidMinor)}</strong>
          <span className="stat-card-caption">Renewals through {formatScheduleDate(today)}</span>
        </div>

        <div className="renewal-stat-card upcoming">
          <div className="stat-card-header">
            <span className="stat-card-icon upcoming">
              <Clock size={16} aria-hidden="true" />
            </span>
            <span className="stat-card-title">Remaining to be paid</span>
          </div>
          <strong className="stat-card-value">{formatMoney(upcomingOutflowMinor)}</strong>
          <span className="stat-card-caption">Upcoming cash outflow this month</span>
        </div>
      </section>

      {/* 2. Month-by-Month Grid */}
      <section className="renewal-grid-section" aria-label={`Renewal calendar for ${month}`}>
        <div className="renewal-grid-header">
          <div className="renewal-grid-title">
            <CalendarDays size={18} aria-hidden="true" />
            <h3>Renewal Calendar Grid</h3>
          </div>
          <span className="renewal-grid-hint">
            {selectedDate
              ? `Filtered to ${formatCalendarDate(selectedDate)}`
              : "Tap any day with scheduled renewals to inspect payment details"}
          </span>
          {selectedDate && (
            <button
              type="button"
              className="text-button compact"
              onClick={() => setSelectedDate(null)}
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="renewal-calendar-grid" role="grid" aria-label={`Renewals in ${month}`}>
          {weekdays.map((weekday) => (
            <div className="renewal-weekday" role="columnheader" key={weekday} title={weekday}>
              <span aria-hidden="true">{weekday.slice(0, 3)}</span>
              <span className="sr-only">{weekday}</span>
            </div>
          ))}

          {Array.from({ length: leadingCells }, (_, index) => (
            <div
              className="renewal-day-placeholder"
              role="gridcell"
              key={`renewal-leading-${index}`}
            />
          ))}

          {dates.map((date) => {
            const dayRenewals = renewalsByDate.get(date) ?? [];
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const hasRenewals = dayRenewals.length > 0;
            const dailyOutflow = dayRenewals.reduce((sum, item) => sum + item.amountMinor, 0);

            return (
              <div className="renewal-day-cell" role="gridcell" key={date}>
                <button
                  type="button"
                  className={`renewal-day${isSelected ? " selected" : ""}${
                    isToday ? " today" : ""
                  }${hasRenewals ? " has-renewals" : ""}`}
                  data-renewal-calendar-date={date}
                  aria-label={`${formatCalendarDate(date)}${
                    hasRenewals
                      ? `, ${dayRenewals.length} subscription renewal${
                          dayRenewals.length === 1 ? "" : "s"
                        } totaling ${formatMoney(dailyOutflow)}`
                      : ", no renewals"
                  }`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDate((cur) => (cur === date ? null : date))}
                  onKeyDown={(event) => handleKeyDown(event, date)}
                >
                  <header className="renewal-day-head">
                    <span className="renewal-day-number">{Number(date.slice(-2))}</span>
                    {isToday && <span className="renewal-today-badge">Today</span>}
                  </header>

                  {hasRenewals && (
                    <div className="renewal-day-body">
                      <span className="renewal-outflow-pill" title="Cash flow impact">
                        <ArrowDownRight size={11} aria-hidden="true" />−{formatMoney(dailyOutflow)}
                      </span>

                      <div className="renewal-day-badges">
                        {dayRenewals.map((subscription) => {
                          const isPaid = date <= today;
                          return (
                            <span
                              key={subscription.id}
                              className={`renewal-badge ${isPaid ? "paid" : "due"}`}
                              title={`${subscription.name} · ${formatMoney(
                                subscription.amountMinor,
                              )} · ${isPaid ? "Paid" : "Due"}`}
                            >
                              <i
                                className="renewal-cat-dot"
                                style={{ backgroundColor: subscription.categoryColor }}
                                aria-hidden="true"
                              />
                              <span className="renewal-badge-name">{subscription.name}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Payment Schedule & Timeline View */}
      <section
        className="renewal-timeline-panel"
        aria-label="Upcoming billing cycles and payment schedule"
      >
        <div className="renewal-timeline-heading">
          <div>
            <h3>Payment Schedule & Upcoming Billing Cycles</h3>
            <p>
              {selectedDate
                ? `Showing renewals on ${formatCalendarDate(selectedDate)}`
                : `All scheduled billing cycles in ${formatFullMonth(month)}`}
            </p>
          </div>
          {selectedDate && (
            <button
              type="button"
              className="button secondary compact"
              onClick={() => setSelectedDate(null)}
            >
              Show all month renewals ({activeBilledItems.length})
            </button>
          )}
        </div>

        {displayedScheduleItems.length === 0 ? (
          <div className="renewal-timeline-empty">
            <CalendarClock size={24} aria-hidden="true" />
            <p>
              {selectedDate
                ? `No subscriptions scheduled to renew on ${formatCalendarDate(selectedDate)}.`
                : `No active subscriptions are scheduled to renew in ${formatFullMonth(month)}.`}
            </p>
          </div>
        ) : (
          <ul className="renewal-timeline-list">
            {displayedScheduleItems.map((item) => {
              const billingDate = item.billingDate!;
              const isPaid = billingDate <= today;
              const relative = relativeRenewalLabel(billingDate, today);

              return (
                <li key={item.id} className="renewal-timeline-item">
                  <div className="timeline-date-block">
                    <span className="timeline-date-label">{formatScheduleDate(billingDate)}</span>
                    <span className={`timeline-relative-badge ${isPaid ? "paid" : "upcoming"}`}>
                      {relative}
                    </span>
                  </div>

                  <div className="timeline-info-block">
                    <div className="timeline-name-row">
                      <strong className="timeline-sub-name">{item.name}</strong>
                      <span className="category-chip">
                        <i style={{ backgroundColor: item.categoryColor }} />
                        {item.categoryName}
                      </span>
                    </div>

                    <div className="timeline-meta-row">
                      <span>
                        Debited from: <strong>{item.accountName ?? "Unassigned"}</strong>
                      </span>
                      <span>·</span>
                      <span className="timeline-cycle-tag">
                        {item.billingCycle === "monthly" ? "Monthly billing" : "Yearly billing"}
                      </span>
                    </div>
                  </div>

                  <div className="timeline-amount-block">
                    <span className="timeline-amount-label">Cash-flow impact</span>
                    <strong className="timeline-amount-val">
                      −{formatMoney(item.amountMinor)}
                    </strong>
                  </div>

                  <div className="timeline-action-block">
                    <button
                      type="button"
                      className="icon-button compact"
                      onClick={() => onEdit(item)}
                      aria-label={`Edit ${item.name}`}
                      title="Edit subscription details"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {unbilledActiveItems.length > 0 && !selectedDate && (
          <div className="renewal-unbilled-note">
            <p>
              <strong>Note:</strong> {unbilledActiveItems.length} active subscription
              {unbilledActiveItems.length === 1 ? "" : "s"} (
              {unbilledActiveItems.map((s) => s.name).join(", ")}){" "}
              {unbilledActiveItems.length === 1 ? "is" : "are"} billed annually and not scheduled
              for renewal in {formatFullMonth(month)}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
