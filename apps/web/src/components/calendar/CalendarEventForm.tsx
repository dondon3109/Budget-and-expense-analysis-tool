import {
  calendarEventInputSchema,
  type CalendarEventInput,
  type CalendarEventRecord,
} from "@zoption/shared";
import { CalendarClock, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

interface CalendarEventFormProps {
  initialDate: string;
  item?: CalendarEventRecord;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: CalendarEventInput) => Promise<void>;
  onClose: () => void;
}

export function CalendarEventForm({
  initialDate,
  item,
  busy,
  serverError,
  onSubmit,
  onClose,
}: CalendarEventFormProps) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.date ?? initialDate);
  const [allDay, setAllDay] = useState(!item?.startTime);
  const [startTime, setStartTime] = useState(item?.startTime ?? "");
  const [endTime, setEndTime] = useState(item?.endTime ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [clientError, setClientError] = useState<string>();
  const openerRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = "calendar-event-form-title";

  useEffect(() => () => openerRef.current?.focus(), []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [busy, onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(undefined);

    if (!allDay && !startTime) {
      setClientError("Choose a start time or mark the event as all day.");
      return;
    }

    const parsed = calendarEventInputSchema.safeParse({
      title,
      date,
      startTime: allDay ? null : startTime,
      endTime: allDay || !endTime ? null : endTime,
      notes: notes || null,
    });
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the event details.");
      return;
    }
    await onSubmit(parsed.data);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="form-modal calendar-event-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header calendar-event-form-header">
          <div className="calendar-event-form-heading">
            <span className="calendar-event-form-icon" aria-hidden="true">
              <CalendarClock size={20} />
            </span>
            <div>
              <p className="eyebrow">Calendar event</p>
              <h2 id={titleId}>{item ? "Edit event" : "Add event"}</h2>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close event form"
          >
            <X size={19} />
          </button>
        </header>

        <form className="transaction-form calendar-event-form" onSubmit={handleSubmit}>
          <label>
            <span>Event title</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Dentist appointment"
              maxLength={120}
              required
            />
          </label>

          <div className="calendar-event-schedule">
            <label>
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <label className="calendar-event-all-day">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setAllDay(checked);
                  if (checked) {
                    setStartTime("");
                    setEndTime("");
                  }
                }}
              />
              <span>
                <strong>All day</strong>
                <small>No specific start or end time</small>
              </span>
            </label>
          </div>

          {!allDay && (
            <div className="form-row split calendar-event-times">
              <label>
                <span>Starts</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Ends <small>(optional)</small>
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </label>
            </div>
          )}

          <label>
            <span>
              Notes <small>(optional)</small>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add details that will help you prepare."
              maxLength={500}
              rows={4}
            />
          </label>

          {(clientError || serverError) && (
            <p className="form-error" role="alert">
              {clientError ?? serverError}
            </p>
          )}

          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : item ? "Save changes" : "Add event"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
