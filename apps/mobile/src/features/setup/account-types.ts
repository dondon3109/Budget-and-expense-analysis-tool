import type MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { isLiabilityAccountType, type AccountType } from "@zoption/shared";

const accountTypeDetails: Record<
  AccountType,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  other: { label: "General", icon: "wallet-outline" },
  cash: { label: "Cash", icon: "cash-multiple" },
  checking: { label: "Bank / debit card", icon: "bank-outline" },
  savings: { label: "Savings", icon: "piggy-bank-outline" },
  credit: { label: "Credit card", icon: "credit-card-outline" },
  virtual: { label: "Virtual account", icon: "cellphone-text" },
  investment: { label: "Investment", icon: "chart-line" },
  receivable: { label: "Owes me / Receivables", icon: "account-arrow-left-outline" },
  payable: { label: "I owe / Payables", icon: "account-arrow-right-outline" },
};

/** Picker rows in display order; liabilities carry a detail line so owed balances read as debt. */
export const accountTypeOptions = (Object.keys(accountTypeDetails) as AccountType[]).map(
  (type) => ({
    id: type,
    label: accountTypeDetails[type].label,
    detail: isLiabilityAccountType(type) ? "Liabilities" : undefined,
  }),
);

export function accountTypeLabel(type: AccountType): string {
  return accountTypeDetails[type].label;
}

export function accountTypeIcon(type: AccountType): keyof typeof MaterialCommunityIcons.glyphMap {
  return accountTypeDetails[type].icon;
}
