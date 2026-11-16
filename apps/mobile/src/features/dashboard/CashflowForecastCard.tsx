import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  forecastSubscriptions,
  projectCashflow,
  type Currency,
  type ForecastSubscriptionSource,
  type ForecastRecurringIncome,
} from "@zoption/shared";
import { MoneyValue } from "@/ui/components";
import { useForecastOnTrackStore } from "@/stores/forecast-on-track-store";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { FlatSection } from "./HomeCardParts";
import { withTapSound } from "@/features/sounds/sound-effects";

type HorizonDays = 30 | 60 | 90;

const HORIZONS: readonly HorizonDays[] = [30, 60, 90];
const MAX_BILLS_SHOWN = 5;

export interface CashflowForecastCardProps {
  startingBalanceMinor: number;
  subscriptions: readonly ForecastSubscriptionSource[];
  recurringIncomes?: readonly ForecastRecurringIncome[];
  safetyBufferMinor?: number;
  startDate?: string;
  currency?: Currency;
  onViewSubscriptions?: () => void;
}

function riskLabel(riskLevel: "safe" | "low_buffer" | "critical_deficit"): string {
  if (riskLevel === "critical_deficit") return "Deficit risk";
  if (riskLevel === "low_buffer") return "Low buffer";
  return "On track";
}

export function CashflowForecastCard({
  startingBalanceMinor,
  subscriptions: allSubscriptions,
  recurringIncomes,
  safetyBufferMinor = 0,
  startDate,
  currency: currencyProp,
  onViewSubscriptions,
}: CashflowForecastCardProps) {
  const theme = useZoptionTheme();
  const workspaceCurrency = useWorkspaceCurrency();
  const currency = currencyProp ?? workspaceCurrency;
  const [horizon, setHorizon] = useState<HorizonDays>(30);
  const onTrackDismissed = useForecastOnTrackStore((state) => state.dismissed);
  const dismissOnTrack = useForecastOnTrackStore((state) => state.dismiss);
  // The starting balance is in `currency`, so plans billed in the other one are left out.
  const subscriptions = useMemo(
    () => forecastSubscriptions(allSubscriptions, currency),
    [allSubscriptions, currency],
  );
  const excludedCount = allSubscriptions.filter(
    (sub) => sub.status === "active" && sub.currency !== currency,
  ).length;

  const forecasts = useMemo(
    () =>
      ({
        30: projectCashflow({
          startingBalanceMinor,
          subscriptions,
          recurringIncomes,
          horizonDays: 30,
          safetyBufferMinor,
          startDate,
        }),
        60: projectCashflow({
          startingBalanceMinor,
          subscriptions,
          recurringIncomes,
          horizonDays: 60,
          safetyBufferMinor,
          startDate,
        }),
        90: projectCashflow({
          startingBalanceMinor,
          subscriptions,
          recurringIncomes,
          horizonDays: 90,
          safetyBufferMinor,
          startDate,
        }),
      }) as const,
    [startingBalanceMinor, subscriptions, recurringIncomes, safetyBufferMinor, startDate],
  );
  const selected = forecasts[horizon];

  const firstDeficitDay = selected.dailyTimeline.find((day) => day.isDeficit);
  const visibleBills = selected.upcomingBillRisks.slice(0, MAX_BILLS_SHOWN);
  const hiddenBillsCount = selected.upcomingBillRisks.length - visibleBills.length;

  const status = selected.hasDeficit
    ? {
        tone: "danger" as const,
        icon: "alert-octagon-outline" as const,
        title: "Deficit risk",
        detail: firstDeficitDay ? `Below zero on ${firstDeficitDay.date}.` : "Below zero.",
      }
    : selected.hasBufferDip
      ? {
          tone: "warning" as const,
          icon: "alert-outline" as const,
          title: "Buffer warning",
          detail: `Below your buffer on ${selected.dipDaysCount} day${selected.dipDaysCount === 1 ? "" : "s"}.`,
        }
      : {
          tone: "healthy" as const,
          icon: "check-circle-outline" as const,
          title: "On track",
          detail: null,
        };

  const statusBackground =
    status.tone === "danger"
      ? theme.colors.dangerSoft
      : status.tone === "warning"
        ? theme.colors.warningSoft
        : theme.colors.brandSoft;
  const statusForeground =
    status.tone === "danger"
      ? theme.colors.danger
      : status.tone === "warning"
        ? theme.colors.warning
        : theme.colors.income;

  return (
    <FlatSection accessibilityLabel="Cash flow forecast">
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            Cash flow forecast
          </Text>
        </View>
        {onViewSubscriptions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View bills"
            onPress={withTapSound(onViewSubscriptions)}
            hitSlop={8}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Bills
            </Text>
          </Pressable>
        ) : null}
      </View>

      {excludedCount > 0 ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {excludedCount} {excludedCount === 1 ? "plan" : "plans"} in another currency not included.
        </Text>
      ) : null}

      <View
        accessibilityRole="tablist"
        accessibilityLabel="Forecast horizon"
        style={styles.segmented}
      >
        {HORIZONS.map((days) => {
          const isSelected = days === horizon;
          return (
            <Pressable
              key={days}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${days}-day forecast`}
              onPress={withTapSound(() => setHorizon(days))}
              style={[
                styles.segment,
                {
                  backgroundColor: isSelected ? theme.colors.brand : theme.colors.surface,
                  borderColor: isSelected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  {
                    color: isSelected ? theme.colors.onBrand : theme.colors.text,
                    fontWeight: isSelected ? "600" : "500",
                  },
                ]}
              >
                {days} days
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.projectionRow}>
        {HORIZONS.map((days) => {
          const forecast = forecasts[days];
          const isSelected = days === horizon;
          return (
            <Pressable
              key={days}
              accessibilityRole="button"
              accessibilityLabel={`Show ${days}-day projection`}
              onPress={withTapSound(() => setHorizon(days))}
              style={[
                styles.projectionTile,
                {
                  backgroundColor: theme.colors.canvasMuted,
                  borderColor: isSelected ? theme.colors.brand : theme.colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
            >
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {days}d balance
              </Text>
              <MoneyValue
                amountMinor={forecast.endingBalanceMinor}
                currency={currency}
                tone={forecast.endingBalanceMinor < 0 ? "expense" : "default"}
                style={styles.projectionMoney}
              />
            </Pressable>
          );
        })}
      </View>

      {status.tone === "healthy" && onTrackDismissed ? null : (
        <View style={[styles.statusBanner, { backgroundColor: statusBackground }]}>
          <View
            accessibilityLabel={status.detail ? `${status.title}: ${status.detail}` : status.title}
            accessible
            style={styles.statusBody}
          >
            <MaterialCommunityIcons name={status.icon} size={18} color={statusForeground} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.body, { color: statusForeground, fontWeight: "700" }]}>
                {status.title}
              </Text>
              {status.detail ? (
                <Text style={[typography.caption, { color: statusForeground }]}>
                  {status.detail}
                </Text>
              ) : null}
            </View>
          </View>
          {/* Only good news can be closed; a warning stays until the forecast changes. */}
          {status.tone === "healthy" ? (
            <Pressable
              accessibilityLabel="Close On track"
              accessibilityRole="button"
              hitSlop={8}
              onPress={withTapSound(dismissOnTrack)}
            >
              <MaterialCommunityIcons color={statusForeground} name="close" size={18} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.detailRow}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Lowest balance</Text>
        <View style={styles.detailValue}>
          <MoneyValue
            amountMinor={selected.minProjectedBalanceMinor}
            currency={currency}
            tone={selected.minProjectedBalanceMinor < 0 ? "expense" : "default"}
          />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            on {selected.minBalanceDate}
          </Text>
        </View>
      </View>

      {visibleBills.length === 0 ? (
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          No bills in the next {horizon} days.
        </Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
            Upcoming bills
          </Text>
          {visibleBills.map((bill) => {
            const pillBackground =
              bill.riskLevel === "critical_deficit"
                ? theme.colors.dangerSoft
                : bill.riskLevel === "low_buffer"
                  ? theme.colors.warningSoft
                  : theme.colors.canvasMuted;
            const pillForeground =
              bill.riskLevel === "critical_deficit"
                ? theme.colors.danger
                : bill.riskLevel === "low_buffer"
                  ? theme.colors.warning
                  : theme.colors.textMuted;
            return (
              <View
                key={`${bill.billId}-${bill.dueDate}`}
                accessible
                accessibilityLabel={`${bill.billName}, due ${bill.dueDate}, ${riskLabel(bill.riskLevel)}`}
                style={styles.billRow}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}
                  >
                    {bill.billName}
                  </Text>
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    Due {bill.dueDate}
                    {bill.daysUntilDue === 0
                      ? " · today"
                      : ` · in ${bill.daysUntilDue} day${bill.daysUntilDue === 1 ? "" : "s"}`}
                  </Text>
                </View>
                <View style={styles.billTrailing}>
                  <MoneyValue amountMinor={-bill.amountMinor} currency={currency} tone="expense" />
                  <View style={[styles.riskPill, { backgroundColor: pillBackground }]}>
                    <Text
                      style={[typography.caption, { color: pillForeground, fontWeight: "700" }]}
                    >
                      {riskLabel(bill.riskLevel)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          {hiddenBillsCount > 0 ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              +{hiddenBillsCount} more bill{hiddenBillsCount === 1 ? "" : "s"} in this window
            </Text>
          ) : null}
        </View>
      )}
    </FlatSection>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  segmented: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  projectionRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  projectionTile: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    gap: spacing.xxs,
  },
  projectionMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  statusBody: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  billRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  billTrailing: {
    alignItems: "flex-end",
    gap: 4,
  },
  riskPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
  },
});
