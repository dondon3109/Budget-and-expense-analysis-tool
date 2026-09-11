import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  getDaysLeftInWeek,
  projectCashflow,
  safeToSpend,
  type CashflowForecastOptions,
  type Currency,
  type ForecastRecurringIncome,
} from "@zoption/shared";
import { Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface SafeToSpendHeroProps {
  startingBalanceMinor: number;
  subscriptions: CashflowForecastOptions["subscriptions"];
  recurringIncomes?: readonly ForecastRecurringIncome[];
  remainingBudgetMinor?: number;
  safetyBufferMinor?: number;
  currency?: Currency;
  onViewRenewals?: () => void;
}

export function SafeToSpendHero({
  startingBalanceMinor,
  subscriptions,
  recurringIncomes,
  remainingBudgetMinor,
  safetyBufferMinor = 0,
  currency = "PHP",
  onViewRenewals,
}: SafeToSpendHeroProps) {
  const theme = useZoptionTheme();
  const daysLeftInWeek = useMemo(() => getDaysLeftInWeek(new Date(), "monday"), []);

  // 30-day forecast projection to identify safe liquidity limits
  const forecast = useMemo(() => {
    return projectCashflow({
      startingBalanceMinor,
      subscriptions,
      recurringIncomes,
      horizonDays: 30,
      safetyBufferMinor,
    });
  }, [startingBalanceMinor, subscriptions, recurringIncomes, safetyBufferMinor]);

  // If budget remaining is available, pace it across the remaining week;
  // otherwise, default to safe liquidity from starting balance / forecast.
  const remainingWeeklyEnvelopeMinor = useMemo(() => {
    if (remainingBudgetMinor !== undefined) {
      return Math.max(0, remainingBudgetMinor);
    }
    return Math.max(0, startingBalanceMinor);
  }, [remainingBudgetMinor, startingBalanceMinor]);

  const safeAmountMinor = useMemo(() => {
    return safeToSpend({
      remainingWeeklyEnvelopeMinor,
      daysLeftInWeek,
      forecast: {
        minProjectedBalanceMinor: forecast.minProjectedBalanceMinor,
      },
      safetyBufferMinor,
    });
  }, [remainingWeeklyEnvelopeMinor, daysLeftInWeek, forecast, safetyBufferMinor]);

  const upcomingBilledCount = useMemo(() => {
    return subscriptions.filter((sub) => sub.status === "active").length;
  }, [subscriptions]);

  return (
    <Card accessibilityLabel="Safe to spend this week" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.brandSoft }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={theme.colors.brand} />
          </View>
          <Text style={[typography.label, { color: theme.colors.brand, textTransform: "uppercase" }]}>
            Safe to spend this week
          </Text>
        </View>

        {onViewRenewals ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View renewal calendar"
            accessibilityHint="Opens upcoming renewals and subscriptions"
            onPress={onViewRenewals}
            hitSlop={8}
            style={[styles.renewalsButton, { backgroundColor: theme.colors.canvasMuted }]}
          >
            <MaterialCommunityIcons name="calendar-clock" size={14} color={theme.colors.brand} />
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Renewals
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.amountRow}>
        <MoneyValue
          amountMinor={safeAmountMinor}
          currency={currency}
          style={styles.heroAmount}
        />
        <View style={[styles.pacePill, { backgroundColor: theme.colors.canvasMuted }]}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {daysLeftInWeek} day{daysLeftInWeek === 1 ? "" : "s"} left
          </Text>
        </View>
      </View>

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {safeAmountMinor > 0
          ? `Forward guidance accounting for ${upcomingBilledCount} active recurring bill${upcomingBilledCount === 1 ? "" : "s"} and scheduled obligations.`
          : "Keep spending minimal until your next planned deposit or balance adjustment."}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: radii.sm,
  },
  renewalsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heroAmount: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  pacePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
});
