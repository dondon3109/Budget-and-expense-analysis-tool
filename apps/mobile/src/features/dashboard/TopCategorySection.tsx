import { StyleSheet, Text, View, type DimensionValue } from "react-native";

import { CategoryBadge, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import type { DashboardSummary } from "@zoption/shared";

import { homeCardStyles, SectionHeader } from "./HomeCardParts";

// The category the user spent the most on this month. `spendingByCategory` is
// already sorted largest first, so the top category is its first entry.
export function TopCategorySection({
  summary,
  onViewAll,
}: {
  summary: DashboardSummary;
  onViewAll: () => void;
}) {
  const theme = useZoptionTheme();
  const top = summary.spendingByCategory[0];
  if (!top) return null;

  return (
    <View accessibilityLabel="Top spending category" style={{ gap: spacing.xs }}>
      <SectionHeader
        title="Top spending category"
        actionLabel="View spending by category"
        onAction={onViewAll}
      />
      <View
        accessible
        accessibilityLabel={`${top.name}: ${top.sharePercent} percent of this month's spending`}
        style={{ gap: spacing.xxs }}
      >
        <View style={styles.row}>
          <CategoryBadge emoji={top.iconEmoji ?? null} color={top.color} size={36} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text }]}>
              {top.name}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {top.sharePercent}% of this month's spending
            </Text>
          </View>
          <MoneyValue amountMinor={-top.amountMinor} tone="expense" style={styles.money} />
        </View>
        <View style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}>
          <View
            style={[
              styles.fill,
              { width: `${top.sharePercent}%` as DimensionValue, backgroundColor: top.color },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  money: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
});
