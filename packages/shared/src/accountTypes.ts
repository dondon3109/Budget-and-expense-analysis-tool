import type { Currency } from "./currencies";

// "other" is the plain default account; "checking" covers bank and debit card accounts.
export const accountTypes = [
  "cash",
  "checking",
  "savings",
  "credit",
  "other",
  "virtual",
  "investment",
  "receivable",
  "payable",
  "ewallet",
] as const;
export type AccountType = (typeof accountTypes)[number];

/** Accounts that hold money the user owes. Paying one down is a debt payment. */
export const liabilityAccountTypes = [
  "credit",
  "payable",
] as const satisfies readonly AccountType[];

/** Takes a plain string so stored rows, which the D1 schema leaves untyped, need no cast. */
export function isLiabilityAccountType(type: string): boolean {
  return (liabilityAccountTypes as readonly string[]).includes(type);
}

/** Bank accounts, which can hold entries in several currencies. */
export const multiCurrencyAccountTypes = [
  "checking",
  "savings",
] as const satisfies readonly AccountType[];

export function holdsMultipleCurrencies(type: string): boolean {
  return (multiCurrencyAccountTypes as readonly string[]).includes(type);
}

/**
 * The currency an entry must be recorded in: any account that is not a bank pins it to that
 * account's own currency. Null when every chosen account is a bank, so the user picks freely.
 * Accounts not chosen yet are passed as undefined and ignored.
 */
export function pinnedEntryCurrency(
  accounts: ReadonlyArray<{ type: string; currency: Currency } | undefined>,
): Currency | null {
  for (const account of accounts) {
    if (account && !holdsMultipleCurrencies(account.type)) return account.currency;
  }
  return null;
}
