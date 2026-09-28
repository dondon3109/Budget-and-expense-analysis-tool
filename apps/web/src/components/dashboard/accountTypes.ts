import type { AccountInput } from "@zoption/shared";

export const accountTypes: Array<{ value: AccountInput["type"]; label: string }> = [
  { value: "checking", label: "Bank account" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit card" },
  { value: "other", label: "Other" },
];

/** Human label for an account type, derived from the list that builds the select options. */
export function accountTypeLabel(type: AccountInput["type"]): string {
  return accountTypes.find((option) => option.value === type)?.label ?? type;
}
