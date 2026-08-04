import { currencyMetadata, type Currency } from "@zoption/shared";

const currencyFormatterCache = new Map<Currency, Intl.NumberFormat>();

function currencyFormatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = currencyFormatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currencyMetadata[currency].locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    currencyFormatterCache.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(amountMinor: number, currency: Currency = "PHP"): string {
  return currencyFormatterFor(currency).format(amountMinor / 100);
}

export function formatMoneyParts(
  amountMinor: number,
  currency: Currency = "PHP",
): Intl.NumberFormatPart[] {
  return currencyFormatterFor(currency).formatToParts(amountMinor / 100);
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

export function formatPeriod(from: string, to: string): string {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${from}T00:00:00Z`))} – ${formatter.format(new Date(`${to}T00:00:00Z`))}`;
}

export function formatFullMonth(month: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
