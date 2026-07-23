const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export function formatMoney(amountMinor: number): string {
  return currencyFormatter.format(amountMinor / 100);
}

export function formatMoneyParts(amountMinor: number): Intl.NumberFormatPart[] {
  return currencyFormatter.formatToParts(amountMinor / 100);
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
