import { Text, type TextProps } from "react-native";

import { currencyFractionDigits, currencyMetadata, type Currency } from "@zoption/shared";
import { typography } from "@/ui/tokens";
import { useAmountsHidden } from "@/stores/hide-amounts-store";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";

// Cache Intl.NumberFormat instances per (currency, digits) pair: constructing them
// inside every MoneyValue render allocates two ICU formatters per row in Hermes.
const currencyFormatters = new Map<string, Intl.NumberFormat>();
const plainFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: Currency, digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currencyMetadata[currency].locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

function getPlainFormatter(currency: Currency, digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  let formatter = plainFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currencyMetadata[currency].locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    plainFormatters.set(key, formatter);
  }
  return formatter;
}

/** Two decimals, except none for a whole amount in a zero-decimal currency such as JPY. */
export function formatMoneyMinor(amountMinor: number, currency: Currency): string {
  const digits = currencyFractionDigits(currency, amountMinor);
  return getCurrencyFormatter(currency, digits).format(amountMinor / 100);
}

export function moneyAccessibilityLabel(amountMinor: number, currency: Currency): string {
  const digits = currencyFractionDigits(currency, amountMinor);
  const formatted = getPlainFormatter(currency, digits).format(Math.abs(amountMinor) / 100);
  return `${amountMinor < 0 ? "negative " : ""}${formatted} ${currencyMetadata[currency].plural}`;
}

/** Shown in place of every amount while the user hides balances; the sign is hidden too. */
export function hiddenMoney(currency: Currency): string {
  return `${currencyMetadata[currency].symbol}••••`;
}

export const HIDDEN_AMOUNT_LABEL = "hidden amount";

/**
 * Display formatters that honor the hide balance toggle. Use these for any amount shown
 * outside `MoneyValue`; keep `formatMoneyMinor` for input values and saved-value echoes
 * the user is editing.
 */
export function useMoneyFormat() {
  const hidden = useAmountsHidden();
  return {
    hidden,
    format: (amountMinor: number, currency: Currency) =>
      hidden ? hiddenMoney(currency) : formatMoneyMinor(amountMinor, currency),
    label: (amountMinor: number, currency: Currency) =>
      hidden ? HIDDEN_AMOUNT_LABEL : moneyAccessibilityLabel(amountMinor, currency),
  };
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
  const money = useMoneyFormat();
  const resolvedCurrency = currency ?? workspaceCurrency;
  const color =
    tone === "income"
      ? theme.colors.income
      : tone === "expense"
        ? theme.colors.expense
        : theme.colors.text;
  return (
    <Text
      accessibilityLabel={money.label(amountMinor, resolvedCurrency)}
      style={[typography.money, { color }, style]}
      {...props}
    >
      {money.format(amountMinor, resolvedCurrency)}
    </Text>
  );
}
