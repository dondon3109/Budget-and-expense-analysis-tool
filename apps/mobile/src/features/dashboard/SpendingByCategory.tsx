import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { CategoryBadge, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import type { DashboardSummary } from "@zoption/shared";

import { FlatSection, homeCardStyles, SectionLabel } from "./HomeCardParts";
import { withTapSound } from "@/features/sounds/sound-effects";

export function SpendingByCategory({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const categories = summary.spendingByCategory;
  const max = categories.reduce((largest, item) => Math.max(largest, item.amountMinor), 0);
  if (categories.length === 0) return null;
  return (
    <FlatSection accessibilityLabel="Spending by category">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Spending by category</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View category budgets"
          onPress={withTapSound(() => router.push("/(app)/(tabs)/budgets"))}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            Budgets
          </Text>
        </Pressable>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.allocationBar, { backgroundColor: theme.colors.canvasMuted }]}
      >
        {categories.map((item) => (
          <View
            key={item.categoryId}
            style={{ flex: item.amountMinor, backgroundColor: item.color }}
          />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        {categories.map((item) => {
          const percent = max <= 0 ? 0 : Math.round((item.amountMinor / max) * 100);
          return (
            <View
              key={item.categoryId}
              accessible
              accessibilityLabel={`${item.name}: ${item.sharePercent} percent of spending`}
            >
              <View style={styles.categoryRow}>
                <CategoryBadge emoji={item.iconEmoji ?? null} color={item.color} size={28} />
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {item.name}
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {item.sharePercent}%
                </Text>
                <MoneyValue
                  amountMinor={-item.amountMinor}
                  tone="expense"
                  style={styles.categoryMoney}
                />
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${percent}%` as DimensionValue, backgroundColor: item.color },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </FlatSection>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  categoryMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
});
