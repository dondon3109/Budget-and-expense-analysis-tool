import { isLiabilityAccountType, type AccountInput } from "@zoption/shared";

/**
 * Select options in picker order; "General" is the plain account a new one starts as. It is not
 * called "Default" because account rows already badge the default spending account that way.
 */
export const accountTypes: Array<{ value: AccountInput["type"]; label: string }> = [
  { value: "other", label: "General" },
  { value: "cash", label: "Cash" },
  { value: "checking", label: "Bank / debit card" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit card" },
  { value: "virtual", label: "Virtual account" },
  { value: "investment", label: "Investment" },
  { value: "receivable", label: "Owes me / Receivables" },
  { value: "payable", label: "I owe / Payables" },
];

/** Human label for an account type, derived from the list that builds the select options. */
export function accountTypeLabel(type: AccountInput["type"]): string {
  return accountTypes.find((option) => option.value === type)?.label ?? type;
}

/** Option text marks liabilities so the user knows the balance is money they owe. */
export function accountTypeOptionLabel(type: AccountInput["type"]): string {
  const label = accountTypeLabel(type);
  return isLiabilityAccountType(type) ? `${label} (Liabilities)` : label;
}
