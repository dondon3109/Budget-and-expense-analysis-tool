import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TransactionKindFilter } from "@/db/view-models";
import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { monthLabel } from "@/features/calendar/event-form";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { kindLabels, monthStartForDate } from "./transaction-list-view";

export function TransactionsEmptyView({
  filtering,
  search,
  kind,
  month,
  onResetFilters,
  onGoToCurrentMonth,
}: {
  filtering: boolean;
  search: string;
  kind: TransactionKindFilter;
  month: string;
  onResetFilters: () => void;
  onGoToCurrentMonth: () => void;
}) {
  const theme = useZoptionTheme();
  const { openFeature } = useAccountGate();
  const isCurrentMonth = month === monthStartForDate(new Date());

  if (filtering) {
    return (
      <View style={styles.emptyContainer}>
        <View
          accessibilityElementsHidden
          style={[
            styles.emptyIconBox,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify-remove-outline"
            size={32}
            color={theme.colors.brand}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
        >
          No matching transactions
        </Text>
        <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
          {search.trim().length > 0 && kind !== "all"
            ? `No ${kindLabels[kind].toLowerCase()} transactions match "${search.trim()}".`
            : search.trim().length > 0
              ? `No transactions match "${search.trim()}".`
              : `No ${kindLabels[kind].toLowerCase()} transactions recorded in ${monthLabel(month)}.`}
        </Text>
        <Button variant="secondary" onPress={onResetFilters}>
          Clear filters
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <View
        accessibilityElementsHidden
        style={[
          styles.emptyIconBox,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons name="receipt-text-outline" size={34} color={theme.colors.brand} />
      </View>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
      >
        No transactions in {monthLabel(month)}
      </Text>
      <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
        Record your spending, income, or scan a paper receipt to track this month&apos;s activity.
      </Text>
      <View style={styles.emptyActions}>
        <Button
          accessibilityHint="Opens the new transaction form"
          onPress={() => router.push("/(app)/transaction")}
          variant="primary"
        >
          Add transaction
        </Button>
        <Button
          accessibilityHint="Opens camera to scan a receipt"
          onPress={() => openFeature("receipt-scan", "/(app)/receipt-scan")}
          variant="secondary"
        >
          Scan receipt
        </Button>
      </View>
      {!isCurrentMonth ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Jump to ${monthLabel(monthStartForDate(new Date()))}`}
          hitSlop={8}
          onPress={onGoToCurrentMonth}
          style={styles.currentMonthLink}
        >
          <MaterialCommunityIcons name="calendar-today" size={16} color={theme.colors.brand} />
          <Text style={[typography.label, { color: theme.colors.brand }]}>
            Jump to {monthLabel(monthStartForDate(new Date()))}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  emptyDescription: {
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  emptyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  currentMonthLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
