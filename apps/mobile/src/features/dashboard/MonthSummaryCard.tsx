import { StyleSheet, Text, View } from "react-native";

import { MoneyValue } from "@/ui/components";
import { fullDateLabel } from "@/ui/components/cashflow-chart-geometry";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import type { DashboardSummary } from "@zoption/shared";

import { FlatSection, homeCardStyles, SectionLabel } from "./HomeCardParts";

function Stat({
  label,
  amountMinor,
  tone,
}: {
  label: string;
  amountMinor: number;
  tone: "income" | "expense";
}) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.stat}>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
      <MoneyValue amountMinor={amountMinor} tone={tone} style={typography.headline} />
    </View>
  );
}

export function MonthSummaryCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const { metrics } = summary;
  return (
    <FlatSection divided={false} accessibilityLabel="This month summary">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>This month</SectionLabel>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {fullDateLabel(summary.period.from, "month")}
        </Text>
      </View>

      <View style={styles.statRow}>
        <Stat label="Money in" amountMinor={metrics.moneyInMinor} tone="income" />
        <Stat label="Money out" amountMinor={-metrics.moneyOutMinor} tone="expense" />
        <Stat
          label="Net flow"
          amountMinor={metrics.netMinor}
          tone={metrics.netMinor >= 0 ? "income" : "expense"}
        />
      </View>
    </FlatSection>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  statRow: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2 },
});
