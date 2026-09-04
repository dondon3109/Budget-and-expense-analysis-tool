import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  projectCashflow,
  type CashflowForecastOptions,
  type Currency,
  type ForecastRecurringIncome,
} from "@zoption/shared";
import { Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

type HorizonDays = 30 | 60 | 90;

const HORIZONS: readonly HorizonDays[] = [30, 60, 90];
const MAX_BILLS_SHOWN = 5;

export interface CashflowForecastCardProps {
  startingBalanceMinor: number;
  subscriptions: CashflowForecastOptions["subscriptions"];
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
  subscriptions,
  recurringIncomes,
  safetyBufferMinor = 0,
  startDate,
  currency = "PHP",
  onViewSubscriptions,
}: CashflowForecastCardProps) {
  const theme = useZoptionTheme();
  const [horizon, setHorizon] = useState<HorizonDays>(30);

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
        detail: firstDeficitDay
          ? `Balance projected below zero on ${firstDeficitDay.date}.`
          : "Balance projected below zero.",
      }
    : selected.hasBufferDip
      ? {
          tone: "warning" as const,
          icon: "alert-outline" as const,
          title: "Buffer warning",
          detail: `Balance dips below your buffer on ${selected.dipDaysCount} day${selected.dipDaysCount === 1 ? "" : "s"} — lowest on ${selected.minBalanceDate}.`,
        }
      : {
          tone: "healthy" as const,
          icon: "check-circle-outline" as const,
          title: "On track",
          detail: `Balance stays above your buffer through ${selected.endDate}.`,
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
    <Card accessibilityLabel="Cash flow forecast">
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            Cash flow forecast
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Projected balance after upcoming bills and renewals.
          </Text>
        </View>
        {onViewSubscriptions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View subscriptions"
            onPress={onViewSubscriptions}
            hitSlop={8}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Subscriptions
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View accessibilityRole="tablist" accessibilityLabel="Forecast horizon" style={styles.segmented}>
        {HORIZONS.map((days) => {
          const isSelected = days === horizon;
          return (
            <Pressable
              key={days}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${days}-day forecast`}
              onPress={() => setHorizon(days)}
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
              onPress={() => setHorizon(days)}
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

      <View
        accessibilityLabel={`${status.title}: ${status.detail}`}
        style={[styles.statusBanner, { backgroundColor: statusBackground }]}
      >
        <MaterialCommunityIcons name={status.icon} size={18} color={statusForeground} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.body, { color: statusForeground, fontWeight: "700" }]}>
            {status.title}
          </Text>
          <Text style={[typography.caption, { color: statusForeground }]}>{status.detail}</Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Lowest balance
        </Text>
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
          No upcoming bills or renewals in the next {horizon} days.
        </Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
            Upcoming bills and renewals
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
    </Card>
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
