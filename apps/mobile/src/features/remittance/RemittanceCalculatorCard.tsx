import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  calculateRemittance,
  compareRemittanceProviders,
  OFW_CURRENCIES,
  parseAmountToMinor,
  remittanceDirectionFor,
  remittanceMidMarketRate,
  type OfwCurrency,
  type RemittanceCurrency,
  type RemittanceProvider,
} from "@zoption/shared";
import { Card, FormField } from "@/ui/components";
import { formatMoneyMinor } from "@/ui/components/MoneyValue";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
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
  initialForeignCurrency?: OfwCurrency;
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

/** Peso benchmarks read fine at two decimals; a peso sent out buys a fraction of a unit. */
function formatRate(rate: number, toPhp: boolean, digits: number): string {
  return rate.toFixed(toPhp ? digits : 6);
}

function formatRemittanceMinor(amountMinor: number, currency: RemittanceCurrency): string {
  return currency === "PHP"
    ? formatMoneyMinor(amountMinor, "PHP")
    : formatForeignMinor(amountMinor, currency);
}

function currencyName(currency: RemittanceCurrency): string {
  return currency === "PHP" ? "Philippine pesos" : CURRENCY_NAMES[currency];
}

export function RemittanceCalculatorCard({
  initialForeignCurrency = "USD",
  initialSendAmountMinor = 50000,
  initialTransferFeeMinor = 0,
}: RemittanceCalculatorCardProps) {
  const theme = useZoptionTheme();
  const workspaceCurrency = useWorkspaceCurrency();
  // A PHP workspace sends pesos abroad; a USD workspace sends dollars home.
  const direction = remittanceDirectionFor(workspaceCurrency);
  const toPhp = direction === "to_php";
  const [foreignCurrency, setForeignCurrency] = useState<OfwCurrency>(initialForeignCurrency);
  const sendCurrency: RemittanceCurrency = toPhp ? foreignCurrency : "PHP";
  const receiveCurrency: RemittanceCurrency = toPhp ? "PHP" : foreignCurrency;
  const [amountText, setAmountText] = useState(() => formatMinorToInput(initialSendAmountMinor));
  const [feeText, setFeeText] = useState(() => formatMinorToInput(initialTransferFeeMinor));
  const [provider, setProvider] = useState<RemittanceProvider>("wise");

  const sendAmountMinor = parseMinorOrZero(amountText);
  const transferFeeMinor = parseMinorOrZero(feeText);

  const result = useMemo(
    () =>
      calculateRemittance({
        sendAmountMinor,
        foreignCurrency,
        direction,
        provider,
        transferFeeMinor,
      }),
    [sendAmountMinor, foreignCurrency, direction, provider, transferFeeMinor],
  );

  const comparison = useMemo(
    () => compareRemittanceProviders(sendAmountMinor, foreignCurrency, direction),
    [sendAmountMinor, foreignCurrency, direction],
  );

  const bestProvider = useMemo<RemittanceProvider>(() => {
    let best: RemittanceProvider = "wise";
    let maxReceived = comparison.wise?.netReceivedMinor ?? 0;
    for (const candidate of COMMERCIAL_PROVIDERS) {
      const received = comparison[candidate]?.netReceivedMinor ?? 0;
      if (received > maxReceived) {
        maxReceived = received;
        best = candidate;
      }
    }
    return best;
  }, [comparison]);

  const benchmarkRate = remittanceMidMarketRate(foreignCurrency, direction);
  // "1 USD = ₱56.50" when sending home; "1 PHP = 0.017699 USD" when sending pesos out.
  const rateLine = (rate: number, digits: number) =>
    toPhp
      ? `1 ${foreignCurrency} = ₱${formatRate(rate, toPhp, digits)}`
      : `1 PHP = ${formatRate(rate, toPhp, digits)} ${foreignCurrency}`;

  return (
    <Card accessibilityLabel="Remittance calculator">
      <View style={{ gap: 2 }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          Remittance calculator
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Compare what arrives in {receiveCurrency} after transfer fees and provider FX spread.
        </Text>
      </View>

      <View
        accessibilityRole="tablist"
        accessibilityLabel={toPhp ? "Origin currency" : "Destination currency"}
        style={styles.chipGrid}
      >
        {OFW_CURRENCIES.map((currency) => {
          const selected = currency === foreignCurrency;
          return (
            <Pressable
              key={currency}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${currency}, ${CURRENCY_NAMES[currency]}`}
              onPress={() => setForeignCurrency(currency)}
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
        accessibilityLabel={`Converting ${currencyName(sendCurrency)} to ${currencyName(receiveCurrency)}`}
        style={[styles.routeRow, { backgroundColor: theme.colors.canvasMuted }]}
      >
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          {sendCurrency} → {receiveCurrency}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Mid-market benchmark: {rateLine(benchmarkRate, 2)}
        </Text>
      </View>

      <FormField
        label={`Send amount (${sendCurrency})`}
        value={amountText}
        onChangeText={setAmountText}
        placeholder="500"
        keyboardType="decimal-pad"
        hint={`Available balance shown in ${sendCurrency}; converted below at the provider rate.`}
      />
      <FormField
        label={`Transfer fee (${sendCurrency})`}
        value={feeText}
        onChangeText={setFeeText}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
          Provider
        </Text>
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Remittance provider"
          style={styles.providerGrid}
        >
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
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
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
        <Text style={[typography.money, { color: theme.colors.text }, styles.resultMoney]}>
          {formatRemittanceMinor(result.netReceivedMinor, receiveCurrency)}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Effective rate: {rateLine(result.effectiveRate, 4)}
        </Text>
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Gross value (mid-market)
          </Text>
          <Text style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}>
            {formatRemittanceMinor(result.grossConvertedMinor, receiveCurrency)}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Provider spread loss
          </Text>
          <Text style={[typography.body, { color: theme.colors.expense, fontWeight: "600" }]}>
            −{formatRemittanceMinor(result.spreadLossMinor, receiveCurrency)}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Transfer fee ({formatRemittanceMinor(transferFeeMinor, sendCurrency)})
          </Text>
          <Text style={[typography.body, { color: theme.colors.expense, fontWeight: "600" }]}>
            −{formatRemittanceMinor(result.transferFeeConvertedMinor, receiveCurrency)}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Total cost · {result.effectiveLossPercent.toFixed(2)}% drag
          </Text>
          <Text style={[typography.body, { color: theme.colors.text, fontWeight: "700" }]}>
            {formatRemittanceMinor(result.totalCostMinor, receiveCurrency)}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
          Provider spread comparison · {formatRemittanceMinor(sendAmountMinor, sendCurrency)}
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
              accessibilityLabel={`${PROVIDER_LABELS[option]}: net ${formatRemittanceMinor(entry.netReceivedMinor, receiveCurrency)}${isBest ? ", best value" : ""}`}
              onPress={() => setProvider(option)}
              style={[
                styles.comparisonRow,
                {
                  backgroundColor: isSelected ? theme.colors.brandSoft : theme.colors.surface,
                  borderColor: isSelected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.comparisonTitleRow}>
                  <Text style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}>
                    {PROVIDER_LABELS[option]}
                  </Text>
                  {isBest ? (
                    <View style={[styles.bestPill, { backgroundColor: theme.colors.brand }]}>
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
                  {rateLine(entry.effectiveRate, 4)} · spread loss{" "}
                  {formatRemittanceMinor(entry.spreadLossMinor, receiveCurrency)}
                </Text>
              </View>
              <Text style={[typography.body, { color: theme.colors.text, fontWeight: "700" }]}>
                {formatRemittanceMinor(entry.netReceivedMinor, receiveCurrency)}
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
