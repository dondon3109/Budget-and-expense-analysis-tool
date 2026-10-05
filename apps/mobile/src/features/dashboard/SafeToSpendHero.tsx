import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  forecastSubscriptions,
  getDaysLeftInWeek,
  hasSpendingBasis,
  overspendingAlert,
  overspendingAlertMessage,
  projectCashflow,
  safeToSpend,
  type Currency,
  type ForecastSubscriptionSource,
  type ForecastRecurringIncome,
} from "@zoption/shared";
import { useOverspendingNotification } from "@/features/reminders/overspending-notification";
import { Card, MoneyValue } from "@/ui/components";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface SafeToSpendHeroProps {
  startingBalanceMinor: number;
  subscriptions: readonly ForecastSubscriptionSource[];
  recurringIncomes?: readonly ForecastRecurringIncome[];
  remainingBudgetMinor?: number;
  safetyBufferMinor?: number;
  currency?: Currency;
  onViewRenewals?: () => void;
}

export function SafeToSpendHero({
  startingBalanceMinor,
  subscriptions: allSubscriptions,
  recurringIncomes,
  remainingBudgetMinor,
  safetyBufferMinor = 0,
  currency: currencyProp,
  onViewRenewals,
}: SafeToSpendHeroProps) {
  const theme = useZoptionTheme();
  const workspaceCurrency = useWorkspaceCurrency();
  const currency = currencyProp ?? workspaceCurrency;
  const subscriptions = useMemo(
    () => forecastSubscriptions(allSubscriptions, currency),
    [allSubscriptions, currency],
  );
  // Plans billed in the other currency can't come out of this balance, so say they're left out.
  const excludedCount = allSubscriptions.filter(
    (sub) => sub.status === "active" && sub.currency !== currency,
  ).length;
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

  const hasBasis = hasSpendingBasis({ startingBalanceMinor, remainingBudgetMinor });
  const alert = useMemo(
    () => overspendingAlert({ safeToSpendMinor: safeAmountMinor, forecast, hasBasis }),
    [safeAmountMinor, forecast, hasBasis],
  );
  const alertMessage = alert ? overspendingAlertMessage(alert) : null;
  useOverspendingNotification(alert);

  return (
    <Card
      accessibilityLabel="Safe to spend this week"
      style={[styles.card, { backgroundColor: theme.colors.brandSoft, borderColor: "transparent" }]}
    >
      <View style={styles.headerRow}>
        <Text style={[typography.label, { color: theme.colors.brand }]}>
          Safe to spend this week
        </Text>
        {onViewRenewals ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View renewal calendar"
            accessibilityHint="Opens upcoming renewals and subscriptions"
            onPress={onViewRenewals}
            hitSlop={8}
            style={[styles.renewalsButton, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <MaterialCommunityIcons name="calendar-clock" size={14} color={theme.colors.brand} />
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Renewals
            </Text>
          </Pressable>
        ) : null}
      </View>

      <MoneyValue amountMinor={safeAmountMinor} currency={currency} style={styles.heroAmount} />
      {safeAmountMinor > 0 ? null : (
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          {hasBasis
            ? "Keep spending minimal until your next planned deposit or balance adjustment."
            : "Add your balance or a first transaction to see what's safe to spend."}
        </Text>
      )}
      {alertMessage ? (
        <View
          accessible
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: theme.colors.dangerSoft }]}
        >
          <MaterialCommunityIcons name="alert-outline" size={18} color={theme.colors.danger} />
          <View style={styles.alertText}>
            <Text style={[typography.headline, { color: theme.colors.danger }]}>
              {alertMessage.title}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.text }]}>
              {alertMessage.body}
            </Text>
          </View>
        </View>
      ) : null}
      {excludedCount > 0 ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {excludedCount} {excludedCount === 1 ? "plan" : "plans"} billed in another currency{" "}
          {excludedCount === 1 ? "isn't" : "aren't"} counted here.
        </Text>
      ) : null}
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
  renewalsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
    flexShrink: 0,
  },
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  alertText: {
    flex: 1,
    gap: spacing.xxs,
  },
  heroAmount: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "700",
    letterSpacing: -1,
  },
});
