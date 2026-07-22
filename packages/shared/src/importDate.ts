function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

export function normalizeImportDate(value: string): string | undefined {
  const text = value.trim();
  const dateTimeMatch = /^(.+?)[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (dateTimeMatch) {
    const hour = Number(dateTimeMatch[2]);
    const minute = Number(dateTimeMatch[3]);
    const second = Number(dateTimeMatch[4] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return undefined;
  }
  const dateText = dateTimeMatch?.[1] ?? text;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText);
  const match = isoMatch ?? slashMatch;
  if (!match) return undefined;

  const year = Number(isoMatch ? match[1] : match[3]);
  const month = Number(isoMatch ? match[2] : match[1]);
  const day = Number(isoMatch ? match[3] : match[2]);
  if (!isCalendarDate(year, month, day)) return undefined;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
