import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useDashboardData } from "@/db/local-workspace-state";
import { buildDashboardView, localIsoDate } from "@/features/dashboard/dashboard-view";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  Card,
  CashflowChart,
  ChartCard,
  EmptyState,
  ErrorState,
  MoneyValue,
  OfflineBanner,
  Skeleton,
  SyncStatus,
} from "@/ui/components";
import { fullDateLabel } from "@/ui/components/cashflow-chart-geometry";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import type { CashflowTrend, DashboardSummary } from "@zoption/shared";

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

function SectionLabel({ children }: { children: string }) {
  const theme = useZoptionTheme();
  return <Text style={[typography.headline, { color: theme.colors.text }]}>{children}</Text>;
}

function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  return (
    <Card accessibilityLabel="Account balances">
      <SectionLabel>Total Balance</SectionLabel>
      <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} style={styles.heroMoney} />
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Calculated from your recorded ledger across all accounts.
      </Text>
      {balances && balances.items.length > 0 ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.xxs }}>
          {balances.items.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <View style={styles.accountLeading}>
                <View
                  accessibilityElementsHidden
                  style={[styles.accountIconBox, { backgroundColor: theme.colors.brandSoft }]}
                >
                  <MaterialCommunityIcons name="wallet-outline" size={16} color={theme.colors.brand} />
                </View>
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {account.name}
                </Text>
              </View>
              <MoneyValue amountMinor={account.balanceMinor} currency={account.currency} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function MonthSummaryCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const { metrics, insights } = summary;
  return (
    <Card accessibilityLabel="This month summary">
      <SectionLabel>This month</SectionLabel>
      <View style={styles.metricRow}>
        <View style={styles.metricLabelGroup}>
          <View
            accessibilityElementsHidden
            style={[styles.metricIconWrap, { backgroundColor: theme.colors.brandSoft }]}
          >
            <MaterialCommunityIcons name="arrow-down-left" size={18} color={theme.colors.income} />
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>Money in</Text>
        </View>
        <MoneyValue amountMinor={metrics.moneyInMinor} tone="income" />
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metricLabelGroup}>
          <View
            accessibilityElementsHidden
            style={[styles.metricIconWrap, { backgroundColor: theme.colors.dangerSoft }]}
          >
            <MaterialCommunityIcons name="arrow-up-right" size={18} color={theme.colors.expense} />
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>Money out</Text>
        </View>
        <MoneyValue amountMinor={-metrics.moneyOutMinor} tone="expense" />
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metricLabelGroup}>
          <View
            accessibilityElementsHidden
            style={[styles.metricIconWrap, { backgroundColor: theme.colors.canvasMuted }]}
          >
            <MaterialCommunityIcons name="scale-balance" size={18} color={theme.colors.brand} />
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>Net flow</Text>
        </View>
        <MoneyValue
          amountMinor={metrics.netMinor}
          tone={metrics.netMinor >= 0 ? "income" : "expense"}
        />
      </View>
      <View style={styles.metricRow}>
        <View style={styles.metricLabelGroup}>
          <View
            accessibilityElementsHidden
            style={[styles.metricIconWrap, { backgroundColor: theme.colors.canvasMuted }]}
          >
            <MaterialCommunityIcons name="piggy-bank-outline" size={18} color={theme.colors.brand} />
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>Savings rate</Text>
        </View>
        <Text style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}>
          {insights.savingsRatePercent === null ? "—" : insights.savingsRatePercent + "%"}
        </Text>
      </View>
    </Card>
  );
}

function SpendingByCategory({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const max = summary.spendingByCategory.reduce(
    (largest, item) => Math.max(largest, item.amountMinor),
    0,
  );
  if (summary.spendingByCategory.length === 0) {
    return (
      <Card>
        <SectionLabel>Spending by category</SectionLabel>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          No expenses recorded this month.
        </Text>
      </Card>
    );
  }
  return (
    <Card accessibilityLabel="Spending by category">
      <SectionLabel>Spending by category</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        {summary.spendingByCategory.map((item) => {
          const percent = max <= 0 ? 0 : Math.round((item.amountMinor / max) * 100);
          return (
            <View
              key={item.categoryId}
              accessible
              accessibilityLabel={item.name + ": " + item.sharePercent + " percent of spending"}
            >
              <View style={styles.categoryRow}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {item.name}
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {item.sharePercent + "%"}
                </Text>
                <MoneyValue amountMinor={-item.amountMinor} tone="expense" />
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.fill,
                    { width: (percent + "%") as DimensionValue, backgroundColor: item.color },
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

function CashflowCard({
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

function BudgetCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const hasBudgets = summary.budgetProgress.length > 0;
  return (
    <Card accessibilityLabel="Budgets overview">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Budgets</SectionLabel>
        {hasBudgets ? (
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
        ) : null}
      </View>
      {!hasBudgets ? (
        <EmptyState
          title="No monthly budget yet"
          description="Set spending limits by category to keep your monthly money goals on track."
          action={
            <Button
              variant="secondary"
              onPress={() => router.push("/(app)/(tabs)/budgets")}
            >
              Set up budgets
            </Button>
          }
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {summary.budgetProgress.slice(0, 3).map((item) => {
            const percent = Math.min(100, item.usedPercent);
            const overBudget = item.usedPercent > 100 || item.remainingMinor < 0;
            return (
              <View key={item.categoryId} style={{ gap: spacing.xxs }}>
                <View style={styles.budgetRowHeader}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text, flex: 1 }]}>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: overBudget ? theme.colors.danger : theme.colors.textMuted,
                        fontWeight: overBudget ? "600" : "500",
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
                        width: (`${percent}%` as DimensionValue),
                        backgroundColor: overBudget ? theme.colors.danger : item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

export default function HomeScreen() {
  const dashboard = useDashboardData();
  const sync = useSyncState();
  const planState = usePlan();
  const [cashflowView, setCashflowView] = useState<CashflowTrend["view"]>("weekly");
  const view = useMemo(
    () =>
      dashboard.data
        ? buildDashboardView(dashboard.data, localIsoDate(new Date()), cashflowView)
        : null,
    [dashboard.data, cashflowView],
  );
  const hasTransactions = Boolean(view && view.summary.monthlyTrend.length > 0);
  const isPro = planState.plan === "zoption_pro";

  return (
    <Screen action={<SyncStatus state={visibleSyncState(sync.status)} />} title="Home">
      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <ErrorState message={sync.message} onRetry={sync.retry} title="Sync paused" />
      ) : null}
      {dashboard.error ? (
        <ErrorState
          message={dashboard.error}
          onRetry={dashboard.retry}
          title="Local data unavailable"
        />
      ) : !view ? (
        <View accessibilityLabel="Loading dashboard" style={{ gap: spacing.sm }}>
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </View>
      ) : hasTransactions ? (
        <View style={{ gap: spacing.md }}>
          <BalanceCard summary={view.summary} />
          <MonthSummaryCard summary={view.summary} />
          <SpendingByCategory summary={view.summary} />
          <CashflowCard
            cashflow={view.cashflow}
            isPro={isPro}
            onSelectView={setCashflowView}
            selectedView={cashflowView}
          />
          <BudgetCard summary={view.summary} />
        </View>
      ) : (
        <EmptyState
          title={sync.status === "syncing" ? "Checking your workspace…" : "No transactions yet"}
          description="Add a transaction or wait for your records to synchronize. Synchronized data is read from encrypted local storage."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroMoney: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    marginVertical: spacing.xxs,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  accountLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  accountIconBox: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  metricLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  segmented: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radii.round,
  },
  track: {
    height: 8,
    borderRadius: radii.round,
    overflow: "hidden",
    marginTop: spacing.xxs,
  },
  fill: {
    height: 8,
    borderRadius: radii.round,
  },
});
