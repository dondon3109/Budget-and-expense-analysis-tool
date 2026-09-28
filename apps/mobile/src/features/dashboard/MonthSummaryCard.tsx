import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View, type DimensionValue } from "react-native";

import { Card, MoneyValue } from "@/ui/components";
import { fullDateLabel } from "@/ui/components/cashflow-chart-geometry";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import type { DashboardSummary } from "@zoption/shared";

import { homeCardStyles, SectionLabel } from "./HomeCardParts";

function FlowRow({
  label,
  icon,
  amountMinor,
  maxMinor,
  tone,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  amountMinor: number;
  maxMinor: number;
  tone: "income" | "expense";
}) {
  const theme = useZoptionTheme();
  const color = tone === "income" ? theme.colors.income : theme.colors.expense;
  const percent = maxMinor <= 0 ? 0 : Math.round((amountMinor / maxMinor) * 100);
  return (
    <View style={{ gap: spacing.xxs }}>
      <View style={styles.flowRowHeader}>
        <MaterialCommunityIcons accessibilityElementsHidden name={icon} size={16} color={color} />
        <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
          {label}
        </Text>
        <MoneyValue
          amountMinor={tone === "income" ? amountMinor : -amountMinor}
          tone={tone}
          style={typography.headline}
        />
      </View>
      <View style={[styles.flowTrack, { backgroundColor: theme.colors.canvasMuted }]}>
        <View
          style={[
            styles.flowFill,
            { width: `${percent}%` as DimensionValue, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

export function MonthSummaryCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const { metrics, insights } = summary;
  const maxFlowMinor = Math.max(metrics.moneyInMinor, metrics.moneyOutMinor);
  return (
    <Card accessibilityLabel="This month summary">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>This month</SectionLabel>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {fullDateLabel(summary.period.from, "month")}
        </Text>
      </View>

      <FlowRow
        label="Money in"
        icon="arrow-down-left"
        amountMinor={metrics.moneyInMinor}
        maxMinor={maxFlowMinor}
        tone="income"
      />
      <FlowRow
        label="Money out"
        icon="arrow-up-right"
        amountMinor={metrics.moneyOutMinor}
        maxMinor={maxFlowMinor}
        tone="expense"
      />

      <View style={[styles.statRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.stat}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Net flow</Text>
          <MoneyValue
            amountMinor={metrics.netMinor}
            tone={metrics.netMinor >= 0 ? "income" : "expense"}
            style={typography.headline}
          />
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.stat}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Savings rate</Text>
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            {insights.savingsRatePercent === null ? "—" : `${insights.savingsRatePercent}%`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  flowRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  flowTrack: {
    height: 10,
    borderRadius: radii.round,
    overflow: "hidden",
  },
  flowFill: {
    height: 10,
    borderRadius: radii.round,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginHorizontal: spacing.sm,
  },
});
