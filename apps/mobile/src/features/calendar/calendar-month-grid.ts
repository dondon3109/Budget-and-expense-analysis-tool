export const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type CalendarMonthCell = string | null;

/** Builds complete calendar weeks independently of activity data, preserving empty dates. */
export function calendarMonthCells(month: string): CalendarMonthCell[] {
  if (!/^\d{4}-\d{2}-01$/.test(month)) return [];

  const firstDay = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(firstDay.getTime())) return [];
  const year = firstDay.getUTCFullYear();
  const monthIndex = firstDay.getUTCMonth();
  const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: CalendarMonthCell[] = Array.from({ length: firstDay.getUTCDay() }, () => null);

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10));
  }

  const trailingCount = (7 - (cells.length % 7)) % 7;
  cells.push(...Array.from({ length: trailingCount }, () => null));
  return cells;
}
