import type { CalendarEventRecord, SubscriptionMonthItem } from "@zoption/shared";
import { CalendarPlus, Plus } from "lucide-react";

import { calendarEventTimeLabel, formatCalendarDate } from "../../lib/calendar";
import { formatFullMonth, formatMoney } from "../../lib/formatters";

interface CalendarUpcomingEventsProps {
  selectedDate: string;
  visibleMonth: string;
  nextMonth: string;
  events: CalendarEventRecord[];
  subscriptions: SubscriptionMonthItem[];
  today: string;
  isLoading: boolean;
  hasLoadError: boolean;
  subscriptionsLoading: boolean;
  hasSubscriptionsLoadError: boolean;
  onAddEvent: () => void;
  onSelectDate: (date: string) => void;
}

const compactEventDate = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatCompactEventDate(date: string): string {
  return compactEventDate.format(new Date(`${date}T00:00:00Z`));
}

export function CalendarUpcomingEvents({
  selectedDate,
  visibleMonth,
  nextMonth,
  events,
  subscriptions,
  today,
  isLoading,
  hasLoadError,
  subscriptionsLoading,
  hasSubscriptionsLoadError,
  onAddEvent,
  onSelectDate,
}: CalendarUpcomingEventsProps) {
  const rangeLabel = `${formatFullMonth(visibleMonth)}–${formatFullMonth(nextMonth)}`;

  return (
    <section className="calendar-add-event" aria-labelledby="calendar-add-event-title">
      <div className="calendar-add-event-heading">
        <span className="calendar-add-event-icon" aria-hidden="true">
          <CalendarPlus size={19} />
        </span>
        <div className="calendar-add-event-copy">
          <p className="eyebrow">Schedule</p>
          <h2 id="calendar-add-event-title">Add Event</h2>
          <p>Plan an activity for {formatCalendarDate(selectedDate)}.</p>
        </div>
      </div>
      <button className="button primary compact" type="button" onClick={onAddEvent}>
        <Plus size={16} aria-hidden="true" /> Add event
      </button>

      <div className="calendar-upcoming-section">
        <div className="calendar-upcoming-heading">
          <h3>Upcoming</h3>
          <span>{rangeLabel}</span>
        </div>

        {hasLoadError && (
          <p className="calendar-upcoming-status warning" role="status">
            Some upcoming events could not be loaded.
          </p>
        )}
        {isLoading && (
          <p className="calendar-upcoming-status" aria-live="polite">
            Loading upcoming events…
          </p>
        )}
        {!isLoading && !hasLoadError && events.length === 0 && (
          <p className="calendar-upcoming-status">
            No upcoming events in {formatFullMonth(visibleMonth)} or {formatFullMonth(nextMonth)}.
          </p>
        )}

        {events.length > 0 && (
          <ul className="calendar-upcoming-list" aria-label={`Upcoming events for ${rangeLabel}`}>
            {events.map((event) => {
              const fullDate = formatCalendarDate(event.date);
              const timeLabel = calendarEventTimeLabel(event);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="calendar-upcoming-event"
                    aria-label={`View ${event.title} on ${fullDate}, ${timeLabel}`}
                    onClick={() => onSelectDate(event.date)}
                  >
                    <span className="calendar-upcoming-date">
                      {formatCompactEventDate(event.date)}
                    </span>
                    <span className="calendar-upcoming-copy">
                      <strong title={event.title}>{event.title}</strong>
                      <small>{timeLabel}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="calendar-upcoming-section calendar-subscriptions-section">
        <div className="calendar-upcoming-heading">
          <h3>Subscriptions to pay</h3>
          <span>{rangeLabel}</span>
        </div>

        {hasSubscriptionsLoadError && (
          <p className="calendar-upcoming-status warning" role="status">
            Some subscription due dates could not be loaded.
          </p>
        )}
        {subscriptionsLoading && (
          <p className="calendar-upcoming-status" aria-live="polite">
            Loading subscriptions to pay…
          </p>
        )}
        {!subscriptionsLoading && !hasSubscriptionsLoadError && subscriptions.length === 0 && (
          <p className="calendar-upcoming-status">
            No subscriptions to pay in {formatFullMonth(visibleMonth)} or{" "}
            {formatFullMonth(nextMonth)}.
          </p>
        )}

        {subscriptions.length > 0 && (
          <ul
            className="calendar-upcoming-list calendar-subscription-list"
            aria-label={`Subscriptions to pay for ${rangeLabel}`}
          >
            {subscriptions.map((subscription) => {
              const billingDate = subscription.billingDate;
              if (!billingDate) return null;
              const fullDate = formatCalendarDate(billingDate);
              const amount = formatMoney(subscription.amountMinor);
              const cycle = subscription.billingCycle === "monthly" ? "Monthly" : "Yearly";
              return (
                <li key={`${subscription.id}:${billingDate}`}>
                  <button
                    type="button"
                    className="calendar-upcoming-event calendar-subscription-event"
                    aria-label={`View ${subscription.name}, due ${fullDate}, ${amount}`}
                    onClick={() => onSelectDate(billingDate)}
                  >
                    <span className="calendar-upcoming-date">
                      {billingDate === today ? "Due today" : formatCompactEventDate(billingDate)}
                    </span>
                    <span className="calendar-upcoming-copy">
                      <strong title={subscription.name}>{subscription.name}</strong>
                      <small>
                        <i
                          className="calendar-subscription-category"
                          style={{ backgroundColor: subscription.categoryColor }}
                          aria-hidden="true"
                        />
                        {cycle} · {subscription.categoryName}
                      </small>
                    </span>
                    <strong className="calendar-subscription-amount">{amount}</strong>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
