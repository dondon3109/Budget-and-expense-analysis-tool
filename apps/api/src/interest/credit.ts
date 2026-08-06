import type { InterestFrequency } from "@zoption/shared";

/** Date as YYYY-MM-DD in the app's Asia/Manila timezone. */
export function manilaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Number of days in the month that `isoMonthStart` (YYYY-MM-01) falls in. */
export function daysInMonth(isoMonthStart: string): number {
  const year = Number(isoMonthStart.slice(0, 4));
  const month = Number(isoMonthStart.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whether `today` is a credit day for the given frequency/pay day. Daily always credits. */
export function isInterestCreditDay(
  frequency: InterestFrequency,
  payDay: number | null,
  today: string,
): boolean {
  if (frequency === "daily") return true;
  if (payDay == null) return false;
  const monthStart = `${today.slice(0, 7)}-01`;
  const day = Math.min(payDay, daysInMonth(monthStart));
  return Number(today.slice(8, 10)) === day;
}

/**
 * Simple-interest credit in minor units, floored toward zero.
 * `annualRateBasisPoints` is an annual percentage scaled by 100 (500 = 5.00%),
 * divided by the number of payout periods in a year (365 daily, 12 monthly, 1 yearly).
 */
export function interestAmountMinor(
  balanceMinor: number,
  annualRateBasisPoints: number,
  frequency: InterestFrequency,
): number {
  const rate = annualRateBasisPoints / 10_000;
  const divisor = frequency === "daily" ? 365 : frequency === "monthly" ? 12 : 1;
  return Math.floor((Math.abs(balanceMinor) * rate) / divisor);
}
