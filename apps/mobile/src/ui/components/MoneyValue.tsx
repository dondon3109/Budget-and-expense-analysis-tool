import { Text, type TextProps } from "react-native";

import { currencyMetadata, type Currency } from "@zoption/shared";
import { typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

export function formatMoneyMinor(amountMinor: number, currency: Currency): string {
  const metadata = currencyMetadata[currency];
  return new Intl.NumberFormat(metadata.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function moneyAccessibilityLabel(amountMinor: number, currency: Currency): string {
  const absolute = Math.abs(amountMinor) / 100;
  const formatted = new Intl.NumberFormat(currencyMetadata[currency].locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absolute);
  const unit = currency === "PHP" ? "Philippine pesos" : "US dollars";
  return `${amountMinor < 0 ? "negative " : ""}${formatted} ${unit}`;
}

interface MoneyValueProps extends TextProps {
  amountMinor: number;
  currency?: Currency;
  tone?: "default" | "income" | "expense";
}

export function MoneyValue({
  amountMinor,
  currency = "PHP",
  tone = "default",
  style,
  ...props
}: MoneyValueProps) {
  const theme = useZoptionTheme();
  const color =
    tone === "income"
      ? theme.colors.income
      : tone === "expense"
        ? theme.colors.expense
        : theme.colors.text;
  return (
    <Text
      accessibilityLabel={moneyAccessibilityLabel(amountMinor, currency)}
      style={[typography.money, { color }, style]}
      {...props}
    >
      {formatMoneyMinor(amountMinor, currency)}
    </Text>
  );
}
