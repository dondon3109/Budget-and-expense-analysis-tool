import type { CalendarEventRecord, SubscriptionMonthItem } from "@zoption/shared";
import { calendarEventTimeLabel, formatCalendarDate } from "../../lib/calendar";
import { formatFullMonth, formatMoney } from "../../lib/formatters";

interface CalendarUpcomingEventsProps {
  visibleMonth: string;
  nextMonth: string;
  events: CalendarEventRecord[];
  subscriptions: SubscriptionMonthItem[];
  today: string;
  isLoading: boolean;
  hasLoadError: boolean;
  subscriptionsLoading: boolean;
  hasSubscriptionsLoadError: boolean;
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
  visibleMonth,
  nextMonth,
  events,
  subscriptions,
  today,
  isLoading,
  hasLoadError,
  subscriptionsLoading,
  hasSubscriptionsLoadError,
  onSelectDate,
}: CalendarUpcomingEventsProps) {
  const rangeLabel = `${formatFullMonth(visibleMonth)}–${formatFullMonth(nextMonth)}`;

  return (
    <section className="calendar-upcoming" aria-labelledby="calendar-upcoming-title">
      <div className="calendar-upcoming-section">
        <div className="calendar-upcoming-heading">
          <h2 id="calendar-upcoming-title">Upcoming</h2>
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
              const amount = formatMoney(subscription.amountMinor, subscription.currency);
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
