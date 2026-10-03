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
