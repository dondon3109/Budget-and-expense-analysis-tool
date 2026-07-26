import type { CalendarEventRecord } from "@zoption/shared";
import { CalendarPlus, Plus } from "lucide-react";

import { calendarEventTimeLabel, formatCalendarDate } from "../../lib/calendar";
import { formatFullMonth } from "../../lib/formatters";

interface CalendarUpcomingEventsProps {
  selectedDate: string;
  visibleMonth: string;
  nextMonth: string;
  events: CalendarEventRecord[];
  isLoading: boolean;
  hasLoadError: boolean;
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
  isLoading,
  hasLoadError,
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
    </section>
  );
}
