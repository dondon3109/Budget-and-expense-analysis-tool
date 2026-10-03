import { Text, type TextProps } from "react-native";

import { currencyFractionDigits, currencyMetadata, type Currency } from "@zoption/shared";
import { typography } from "@/ui/tokens";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";

/** Two decimals, except none for a whole amount in a zero-decimal currency such as JPY. */
export function formatMoneyMinor(amountMinor: number, currency: Currency): string {
  const digits = currencyFractionDigits(currency, amountMinor);
  return new Intl.NumberFormat(currencyMetadata[currency].locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 100);
}

export function moneyAccessibilityLabel(amountMinor: number, currency: Currency): string {
  const digits = currencyFractionDigits(currency, amountMinor);
  const formatted = new Intl.NumberFormat(currencyMetadata[currency].locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(amountMinor) / 100);
  return `${amountMinor < 0 ? "negative " : ""}${formatted} ${currencyMetadata[currency].plural}`;
}

/** Without `currency` the amount is labeled in the workspace currency. */
interface MoneyValueProps extends TextProps {
  amountMinor: number;
  currency?: Currency;
  tone?: "default" | "income" | "expense";
}

export function MoneyValue({
  amountMinor,
  currency,
  tone = "default",
  style,
  ...props
}: MoneyValueProps) {
  const theme = useZoptionTheme();
  const workspaceCurrency = useWorkspaceCurrency();
  const resolvedCurrency = currency ?? workspaceCurrency;
  const color =
    tone === "income"
      ? theme.colors.income
      : tone === "expense"
        ? theme.colors.expense
        : theme.colors.text;
  return (
    <Text
      accessibilityLabel={moneyAccessibilityLabel(amountMinor, resolvedCurrency)}
      style={[typography.money, { color }, style]}
      {...props}
    >
      {formatMoneyMinor(amountMinor, resolvedCurrency)}
    </Text>
  );
}
