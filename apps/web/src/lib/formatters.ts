import { currencyMetadata, type Currency } from "@zoption/shared";
import { amountsHidden } from "./hideAmounts";
import { workspaceCurrency } from "./workspaceCurrency";

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

const HIDDEN_DIGITS = "••••";

/** Masked while the user hides balances (`hideAmounts.ts`); the sign is hidden too. */
export function formatMoney(amountMinor: number, currency: Currency = workspaceCurrency()): string {
  if (amountsHidden()) return currencyMetadata[currency].symbol + HIDDEN_DIGITS;
  return currencyFormatterFor(currency).format(amountMinor / 100);
}

export function formatMoneyParts(
  amountMinor: number,
  currency: Currency = workspaceCurrency(),
): Intl.NumberFormatPart[] {
  if (amountsHidden()) {
    return [
      { type: "currency", value: currencyMetadata[currency].symbol },
      { type: "integer", value: HIDDEN_DIGITS },
    ];
  }
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
