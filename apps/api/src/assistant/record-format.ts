import type { AccountRecord, Currency } from "@zoption/shared";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The only money shape assistant tools hand the model: a currency code and a grouped
 * two-decimal amount. Answer validation grounds every figure against these strings.
 */
export function formatMoney(amountMinor: number, currency: Currency = "PHP"): string {
  return `${currency} ${moneyFormatter.format(amountMinor / 100)}`;
}

export function compactDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117).trimEnd()}…`;
}

export function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

export function findAccountByName(
  items: readonly AccountRecord[],
  accountName: string,
): AccountRecord | undefined {
  const requestedName = normalizedName(accountName);
  const exact = items.find((account) => normalizedName(account.name) === requestedName);
  if (exact) return exact;
  const withoutGenericSuffix = requestedName.replace(/\s+account$/, "").trim();
  if (!withoutGenericSuffix || withoutGenericSuffix === requestedName) return undefined;
  const matches = items.filter((account) => normalizedName(account.name) === withoutGenericSuffix);
  return matches.length === 1 ? matches[0] : undefined;
}
