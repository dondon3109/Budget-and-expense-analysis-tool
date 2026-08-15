export interface EventFormValues {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
}

export interface EventFormErrors {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface EventFormInput {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseEventForm(
  value: EventFormValues,
): { success: true; input: EventFormInput } | { success: false; errors: EventFormErrors } {
  const errors: EventFormErrors = {};
  const title = value.title.trim();
  if (title.length < 1 || title.length > 120) {
    errors.title = "Enter an event title of at most 120 characters.";
  }
  if (!isValidIsoDate(value.date)) {
    errors.date = "Choose a valid date.";
  }
  const startTime = value.startTime.trim();
  const endTime = value.endTime.trim();
  if (startTime && !timePattern.test(startTime)) {
    errors.startTime = "Use a valid 24-hour time like 09:30.";
  }
  if (endTime && !timePattern.test(endTime)) {
    errors.endTime = "Use a valid 24-hour time like 17:30.";
  }
  if (endTime && !startTime) {
    errors.endTime = "Add a start time before the end time.";
  } else if (startTime && endTime && endTime <= startTime) {
    errors.endTime = "The end time must be later than the start time.";
  }
  const notes = value.notes.trim();
  if (notes.length > 500) {
    errors.notes = "Keep notes to 500 characters.";
  }
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return {
    success: true,
    input: {
      title,
      date: value.date,
      startTime: startTime || null,
      endTime: endTime || null,
      notes: notes || null,
    },
  };
}

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

export function monthLabel(month: string): string {
  const date = new Date(month + "T00:00:00Z");
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
