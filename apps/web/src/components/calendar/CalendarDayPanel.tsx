import type { CalendarEventRecord, TransactionListItem } from "@zoption/shared";
import { CalendarPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatCalendarDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";

interface CalendarDayPanelProps {
  date: string;
  items: TransactionListItem[];
  events: CalendarEventRecord[];
  deletingEventId?: string;
  deleteError?: string;
  onAddTransaction: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: CalendarEventRecord) => void;
  onDeleteEvent: (id: string) => Promise<void>;
}

function formatEventTime(time: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function eventTimeLabel(event: CalendarEventRecord): string {
  if (!event.startTime) return "All day";
  const start = formatEventTime(event.startTime);
  return event.endTime ? `${start}–${formatEventTime(event.endTime)}` : start;
}

export function CalendarDayPanel({
  date,
  items,
  events,
  deletingEventId,
  deleteError,
  onAddTransaction,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}: CalendarDayPanelProps) {
  const [confirmingEventId, setConfirmingEventId] = useState<string>();
  const activityCount = items.length + events.length;

  useEffect(() => setConfirmingEventId(undefined), [date]);

  return (
    <aside className="calendar-day-panel" aria-labelledby="calendar-day-title">
      <header className="calendar-day-heading" aria-live="polite">
        <div>
          <p className="eyebrow">Selected day</p>
          <h2 id="calendar-day-title">{formatCalendarDate(date)}</h2>
          <span>
            {events.length} event{events.length === 1 ? "" : "s"} · {items.length} transaction
            {items.length === 1 ? "" : "s"}
          </span>
        </div>
        <button className="button secondary compact" type="button" onClick={onAddTransaction}>
          <Plus size={15} aria-hidden="true" /> Transaction
        </button>
      </header>

      {events.length > 0 && (
        <section className="calendar-event-section" aria-labelledby="calendar-events-title">
          <div className="calendar-day-section-heading">
            <h3 id="calendar-events-title">Events</h3>
            <button className="text-button" type="button" onClick={onAddEvent}>
              <CalendarPlus size={14} aria-hidden="true" /> Add event
            </button>
          </div>
          <div className="calendar-event-list">
            {events.map((event) => {
              const confirming = confirmingEventId === event.id;
              const deleting = deletingEventId === event.id;
              return (
                <article className="calendar-event-item" key={event.id}>
                  <div className="calendar-event-time">{eventTimeLabel(event)}</div>
                  <div className="calendar-event-copy">
                    <strong>{event.title}</strong>
                    {event.notes && <p>{event.notes}</p>}
                  </div>
                  {confirming ? (
                    <div
                      className="calendar-event-confirm"
                      role="group"
                      aria-label={`Delete ${event.title}`}
                    >
                      <span>Delete?</span>
                      <button
                        className="text-button danger"
                        type="button"
                        disabled={deleting}
                        onClick={async () => {
                          try {
                            await onDeleteEvent(event.id);
                            setConfirmingEventId(undefined);
                          } catch {
                            // Keep the confirmation open so the user can retry or cancel.
                          }
                        }}
                      >
                        {deleting ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        disabled={deleting}
                        onClick={() => setConfirmingEventId(undefined)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="calendar-event-actions">
                      <button
                        className="icon-button compact"
                        type="button"
                        onClick={() => onEditEvent(event)}
                        aria-label={`Edit ${event.title}`}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button compact danger"
                        type="button"
                        onClick={() => setConfirmingEventId(event.id)}
                        aria-label={`Delete ${event.title}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {deleteError && (
            <p className="form-error calendar-event-delete-error" role="alert">
              {deleteError}
            </p>
          )}
        </section>
      )}

      {items.length > 0 && (
        <section
          className="calendar-transaction-section"
          aria-labelledby="calendar-transactions-title"
        >
          <div className="calendar-day-section-heading">
            <h3 id="calendar-transactions-title">Transactions</h3>
          </div>
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
        </section>
      )}

      {activityCount === 0 && (
        <div className="calendar-day-empty">
          <strong>Nothing planned for this day.</strong>
          <p>Add an event or transaction and it will appear here.</p>
          <div className="calendar-day-empty-actions">
            <button className="button primary" type="button" onClick={onAddEvent}>
              <CalendarPlus size={16} aria-hidden="true" /> Add event
            </button>
            <button className="button secondary" type="button" onClick={onAddTransaction}>
              <Plus size={16} aria-hidden="true" /> Add transaction
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
