import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CashflowChart, ChartCard, EmptyState } from "@/ui/components";
import { fullDateLabel } from "@/ui/components/cashflow-chart-geometry";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import type { CashflowTrend } from "@zoption/shared";

const CASHFLOW_VIEWS: {
  value: CashflowTrend["view"];
  label: string;
  title: string;
  proOnly: boolean;
}[] = [
  { value: "weekly", label: "7 days", title: "Cash flow · last 7 days", proOnly: false },
  { value: "monthly", label: "Month", title: "Cash flow · this month", proOnly: true },
  { value: "sixMonth", label: "6 months", title: "Cash flow · last 6 months", proOnly: true },
];

export function CashflowCard({
  cashflow,
  isPro,
  onSelectView,
  selectedView,
}: {
  cashflow: CashflowTrend;
  isPro: boolean;
  onSelectView: (view: CashflowTrend["view"]) => void;
  selectedView: CashflowTrend["view"];
}) {
  const theme = useZoptionTheme();
  const title =
    CASHFLOW_VIEWS.find((option) => option.value === selectedView)?.title ?? "Cash flow";
  const summary = `Income and expenses · ${fullDateLabel(
    cashflow.range.from,
    cashflow.granularity,
  )} to ${fullDateLabel(cashflow.range.to, cashflow.granularity)}. Tap a point to see exact amounts, or drag across the chart to scrub.`;
  return (
    <ChartCard title={title} accessibleSummary={summary}>
      <View accessibilityRole="tablist" style={styles.segmented}>
        {CASHFLOW_VIEWS.map((option) => {
          const locked = option.proOnly && !isPro;
          const selected = option.value === selectedView;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={option.label + (locked ? ", requires Pro" : "")}
              disabled={locked}
              onPress={() => onSelectView(option.value)}
              style={[
                styles.segment,
                {
                  backgroundColor: selected ? theme.colors.brand : theme.colors.surface,
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              {locked ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.textMuted}
                  name="lock-outline"
                  size={14}
                />
              ) : null}
              <Text
                style={[
                  typography.caption,
                  {
                    color: selected
                      ? theme.colors.onBrand
                      : locked
                        ? theme.colors.textMuted
                        : theme.colors.text,
                    fontWeight: selected ? "600" : "500",
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!isPro ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Month and 6-month cash flow are Pro features.
        </Text>
      ) : null}
      {cashflow.points.length === 0 ? (
        <EmptyState
          title="No cash flow yet"
          description="Income and expense activity will chart here as you record transactions."
        />
      ) : (
        <CashflowChart cashflow={cashflow} />
      )}
    </ChartCard>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
});
