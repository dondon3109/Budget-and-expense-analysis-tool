import {
  calendarEventInputSchema,
  type CalendarEventInput,
  type CalendarEventRecord,
} from "@zoption/shared";
import { CalendarClock, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  isAgentSubmit,
  readFormText,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "@zoption/web-common/webmcp";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";

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
  const dialogRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // Captured during the first render, while the control that opened the form still has focus:
  // by the time the portal mounts, the trap has already moved focus into the dialog.
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = "calendar-event-form-title";

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: titleInputRef,
    returnFocus: openerRef.current,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  async function runSubmit(formData?: FormData) {
    setClientError(undefined);

    const nextTitle = formData ? readFormText(formData, "title") : title;
    const nextDate = formData ? readFormText(formData, "date", initialDate) : date;
    const nextAllDay = formData ? formData.has("allDay") : allDay;
    const nextStartTime = formData ? readFormText(formData, "startTime") : startTime;
    const nextEndTime = formData ? readFormText(formData, "endTime") : endTime;
    const nextNotes = formData ? readFormText(formData, "notes") : notes;

    if (formData) {
      setTitle(nextTitle);
      setDate(nextDate);
      setAllDay(nextAllDay);
      setStartTime(nextAllDay ? "" : nextStartTime);
      setEndTime(nextAllDay ? "" : nextEndTime);
      setNotes(nextNotes);
    }

    if (!nextAllDay && !nextStartTime) {
      const message = "Choose a start time or mark the event as all day.";
      setClientError(message);
      return { error: message };
    }

    const parsed = calendarEventInputSchema.safeParse({
      title: nextTitle,
      date: nextDate,
      startTime: nextAllDay ? null : nextStartTime,
      endTime: nextAllDay || !nextEndTime ? null : nextEndTime,
      notes: nextNotes || null,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the event details.";
      setClientError(message);
      return { error: message };
    }

    try {
      await onSubmit(parsed.data);
      return { saved: true, event: parsed.data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not save calendar event.",
      };
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAgentSubmit(event)) {
      const formData = new FormData(event.currentTarget);
      respondToAgent(event, runSubmit(formData));
      return;
    }
    void runSubmit();
  }

  // Portalled so the inert application root from useRootLock does not disable the dialog.
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal calendar-event-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
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

        <form
          className="transaction-form calendar-event-form"
          onSubmit={handleSubmit}
          {...webMcpFormProps({
            name: "save-calendar-event",
            description: "Prepare or update a calendar event for user confirmation.",
          })}
        >
          <label>
            <span>Event title</span>
            <input
              ref={titleInputRef}
              name="title"
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
                name="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                {...webMcpParamProps("Event date in YYYY-MM-DD format.")}
              />
            </label>
            <label className="calendar-event-all-day">
              <input
                name="allDay"
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
                  name="startTime"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                  {...webMcpParamProps("24-hour HH:MM start time when All day is unchecked.")}
                />
              </label>
              <label>
                <span>
                  Ends <small>(optional)</small>
                </span>
                <input
                  name="endTime"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  {...webMcpParamProps("24-hour HH:MM end time when All day is unchecked.")}
                />
              </label>
            </div>
          )}

          <label>
            <span>
              Notes <small>(optional)</small>
            </span>
            <textarea
              name="notes"
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
    </div>,
    document.body,
  );
}
