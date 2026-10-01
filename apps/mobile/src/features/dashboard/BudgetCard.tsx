import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import type { DashboardSummary } from "@zoption/shared";

import { homeCardStyles, SectionLabel } from "./HomeCardParts";

export function BudgetCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const hasBudgets = summary.budgetProgress.length > 0;
  if (!hasBudgets) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Set up budgets"
        onPress={() => router.push("/(app)/(tabs)/budgets")}
        style={[styles.slimRow, { borderColor: theme.colors.border }]}
      >
        <Text style={[typography.label, { color: theme.colors.text, flex: 1 }]}>
          Set a monthly budget
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <Card accessibilityLabel="Budgets overview">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Budgets</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all budgets"
          onPress={() => router.push("/(app)/(tabs)/budgets")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            View all
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.sm }}>
        {summary.budgetProgress.slice(0, 3).map((item) => {
          const percent = Math.min(100, item.usedPercent);
          const overBudget = item.usedPercent > 100 || item.remainingMinor < 0;
          return (
            <View key={item.categoryId} style={{ gap: spacing.xxs }}>
              <View style={styles.budgetRowHeader}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.budgetStatusPill,
                    {
                      backgroundColor: theme.colors.canvasMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: theme.colors.textMuted,
                        fontWeight: overBudget ? "700" : "500",
                      },
                    ]}
                  >
                    {overBudget ? "Over budget" : `${100 - item.usedPercent}% left`}
                  </Text>
                </View>
                <Text
                  style={[
                    typography.caption,
                    {
                      color: overBudget ? theme.colors.danger : theme.colors.text,
                      fontWeight: overBudget ? "700" : "600",
                    },
                  ]}
                >
                  {item.usedPercent}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${percent}%` as DimensionValue,
                      backgroundColor: overBudget ? theme.colors.danger : item.color,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  slimRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
  },
  budgetRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  budgetStatusPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
  },
});
