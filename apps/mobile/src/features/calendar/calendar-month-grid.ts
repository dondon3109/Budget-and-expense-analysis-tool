export const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Builds the month as complete Sunday-first weeks of ISO dates, borrowing the neighbouring
 * months' days to fill the first and last week. Independent of activity data.
 */
export function calendarMonthWeeks(month: string): string[][] {
  if (!/^\d{4}-\d{2}-01$/.test(month)) return [];

  const firstDay = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(firstDay.getTime())) return [];
  const year = firstDay.getUTCFullYear();
  const monthIndex = firstDay.getUTCMonth();
  const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = firstDay.getUTCDay();
  const weekCount = Math.ceil((leading + dayCount) / 7);

  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) =>
      new Date(Date.UTC(year, monthIndex, 1 - leading + week * 7 + weekday))
        .toISOString()
        .slice(0, 10),
    ),
  );
}
