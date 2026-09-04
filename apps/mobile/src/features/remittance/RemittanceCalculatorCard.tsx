import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  calculateRemittance,
  compareRemittanceProviders,
  DEFAULT_OFW_EXCHANGE_RATES,
  OFW_CURRENCIES,
  parseAmountToMinor,
  type OfwCurrency,
  type RemittanceProvider,
} from "@zoption/shared";
import { Card, FormField, MoneyValue } from "@/ui/components";
import { formatMoneyMinor } from "@/ui/components/MoneyValue";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

const COMMERCIAL_PROVIDERS: readonly RemittanceProvider[] = [
  "wise",
  "remitly",
  "western_union",
  "bank_wire",
];

const PROVIDER_LABELS: Record<RemittanceProvider, string> = {
  mid_market: "Mid-market",
  wise: "Wise",
  remitly: "Remitly",
  western_union: "Western Union",
  bank_wire: "Bank Wire",
};

const CURRENCY_NAMES: Record<OfwCurrency, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  SGD: "Singapore Dollar",
  AED: "UAE Dirham",
  SAR: "Saudi Riyal",
  JPY: "Japanese Yen",
  CAD: "Canadian Dollar",
  GBP: "British Pound",
  AUD: "Australian Dollar",
};

export interface RemittanceCalculatorCardProps {
  initialFromCurrency?: OfwCurrency;
  initialSendAmountMinor?: number;
  initialTransferFeeMinor?: number;
}

function parseMinorOrZero(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  try {
    return Math.max(0, parseAmountToMinor(trimmed));
  } catch {
    return 0;
  }
}

function formatMinorToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(/\.00$/, "");
}

export function formatForeignMinor(amountMinor: number, currency: OfwCurrency): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function RemittanceCalculatorCard({
  initialFromCurrency = "USD",
  initialSendAmountMinor = 50000,
  initialTransferFeeMinor = 0,
}: RemittanceCalculatorCardProps) {
  const theme = useZoptionTheme();
  const [fromCurrency, setFromCurrency] = useState<OfwCurrency>(initialFromCurrency);
  const [amountText, setAmountText] = useState(() => formatMinorToInput(initialSendAmountMinor));
  const [feeText, setFeeText] = useState(() => formatMinorToInput(initialTransferFeeMinor));
  const [provider, setProvider] = useState<RemittanceProvider>("wise");

  const sendAmountMinor = parseMinorOrZero(amountText);
  const transferFeeMinor = parseMinorOrZero(feeText);

  const result = useMemo(
    () =>
      calculateRemittance({
        sendAmountMinor,
        fromCurrency,
        provider,
        transferFeeMinor,
      }),
    [sendAmountMinor, fromCurrency, provider, transferFeeMinor],
  );

  const comparison = useMemo(
    () => compareRemittanceProviders(sendAmountMinor, fromCurrency),
    [sendAmountMinor, fromCurrency],
  );

  const bestProvider = useMemo<RemittanceProvider>(() => {
    let best: RemittanceProvider = "wise";
    let maxReceived = comparison.wise?.netPhpReceivedMinor ?? 0;
    for (const candidate of COMMERCIAL_PROVIDERS) {
      const received = comparison[candidate]?.netPhpReceivedMinor ?? 0;
      if (received > maxReceived) {
        maxReceived = received;
        best = candidate;
      }
    }
    return best;
  }, [comparison]);

  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[fromCurrency];

  return (
    <Card accessibilityLabel="Remittance calculator">
      <View style={{ gap: 2 }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          Remittance calculator
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Compare what arrives in PHP after transfer fees and provider FX spread.
        </Text>
      </View>

      <View
        accessibilityRole="tablist"
        accessibilityLabel="Origin currency"
        style={styles.chipGrid}
      >
        {OFW_CURRENCIES.map((currency) => {
          const selected = currency === fromCurrency;
          return (
            <Pressable
              key={currency}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${currency}, ${CURRENCY_NAMES[currency]}`}
              onPress={() => setFromCurrency(currency)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.colors.brand : theme.colors.surface,
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  {
                    color: selected ? theme.colors.onBrand : theme.colors.text,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              >
                {currency}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        accessible
        accessibilityLabel={`Converting ${fromCurrency} to Philippine pesos`}
        style={[styles.routeRow, { backgroundColor: theme.colors.canvasMuted }]}
      >
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          {fromCurrency} → PHP
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Mid-market benchmark: 1 {fromCurrency} = ₱{benchmark?.midMarketRate.toFixed(2) ?? "—"}
        </Text>
      </View>

      <FormField
        label={`Send amount (${fromCurrency})`}
        value={amountText}
        onChangeText={setAmountText}
        placeholder="500"
        keyboardType="decimal-pad"
        hint={`Available balance shown in ${fromCurrency}; converted below at the provider rate.`}
      />
      <FormField
        label={`Transfer fee (${fromCurrency})`}
        value={feeText}
        onChangeText={setFeeText}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
          Provider
        </Text>
        <View accessibilityRole="tablist" accessibilityLabel="Remittance provider" style={styles.providerGrid}>
          {COMMERCIAL_PROVIDERS.map((option) => {
            const selected = option === provider;
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={PROVIDER_LABELS[option]}
                onPress={() => setProvider(option)}
                style={[
                  styles.providerTile,
                  {
                    backgroundColor: selected
                      ? theme.colors.brandSoft
                      : theme.colors.surface,
                    borderColor: selected ? theme.colors.brand : theme.colors.border,
                    borderWidth: selected ? 2 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: selected ? theme.colors.brand : theme.colors.text,
                      fontWeight: selected ? "700" : "500",
                    },
                  ]}
                >
                  {PROVIDER_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.resultBox, { backgroundColor: theme.colors.canvasMuted }]}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Recipient receives · {PROVIDER_LABELS[provider]}
        </Text>
        <MoneyValue amountMinor={result.netPhpReceivedMinor} style={styles.resultMoney} />
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Effective rate: 1 {fromCurrency} = ₱{result.effectiveRate.toFixed(4)}
        </Text>
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Gross value (mid-market)
          </Text>
          <Text style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}>
            {formatMoneyMinor(result.grossConvertedPhpMinor, "PHP")}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Provider spread loss
          </Text>
          <Text style={[typography.body, { color: theme.colors.expense, fontWeight: "600" }]}>
            −{formatMoneyMinor(result.spreadLossPhpMinor, "PHP")}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Transfer fee ({formatForeignMinor(transferFeeMinor, fromCurrency)})
          </Text>
          <Text style={[typography.body, { color: theme.colors.expense, fontWeight: "600" }]}>
            −{formatMoneyMinor(result.transferFeeInPhpMinor, "PHP")}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Total cost · {result.effectiveLossPercent.toFixed(2)}% drag
          </Text>
          <Text style={[typography.body, { color: theme.colors.text, fontWeight: "700" }]}>
            {formatMoneyMinor(result.totalCostInPhpMinor, "PHP")}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
          Provider spread comparison · {formatForeignMinor(sendAmountMinor, fromCurrency)}
        </Text>
        {COMMERCIAL_PROVIDERS.map((option) => {
          const entry = comparison[option];
          if (!entry) return null;
          const isBest = option === bestProvider;
          const isSelected = option === provider;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`${PROVIDER_LABELS[option]}: net ${formatMoneyMinor(entry.netPhpReceivedMinor, "PHP")}${isBest ? ", best value" : ""}`}
              onPress={() => setProvider(option)}
              style={[
                styles.comparisonRow,
                {
                  backgroundColor: isSelected
                    ? theme.colors.brandSoft
                    : theme.colors.surface,
                  borderColor: isSelected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.comparisonTitleRow}>
                  <Text
                    style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}
                  >
                    {PROVIDER_LABELS[option]}
                  </Text>
                  {isBest ? (
                    <View
                      style={[styles.bestPill, { backgroundColor: theme.colors.brand }]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          { color: theme.colors.onBrand, fontWeight: "700", fontSize: 10 },
                        ]}
                      >
                        Best value
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  1 {fromCurrency} = ₱{entry.effectiveRate.toFixed(4)} · spread loss{" "}
                  {formatMoneyMinor(entry.spreadLossPhpMinor, "PHP")}
                </Text>
              </View>
              <Text style={[typography.body, { color: theme.colors.text, fontWeight: "700" }]}>
                {formatMoneyMinor(entry.netPhpReceivedMinor, "PHP")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  routeRow: {
    padding: spacing.sm,
    borderRadius: radii.md,
    gap: 2,
  },
  providerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  providerTile: {
    flex: 1,
    minWidth: "47%",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  resultBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.xxs,
    alignItems: "flex-start",
  },
  resultMoney: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  comparisonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  bestPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
  },
});
