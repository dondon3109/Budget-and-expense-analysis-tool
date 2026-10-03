// Calendar arithmetic on ISO dates (UTC, no time zone), shared by the financial reader.

export function monthDifference(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

export function coveredMonthCount(from: string, to: string): number {
  return monthDifference(from, to) + 1;
}

export function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function shiftDays(value: string, amount: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIsoDate(date);
}

export function shiftMonths(value: string, amount: number): string {
  const date = dateFromIso(`${value.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatIsoDate(date);
}

export function monthEnd(value: string): string {
  const date = dateFromIso(shiftMonths(value, 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return formatIsoDate(date);
}

export function daysInclusive(from: string, to: string): number {
  return Math.floor((dateFromIso(to).valueOf() - dateFromIso(from).valueOf()) / 86_400_000) + 1;
}
