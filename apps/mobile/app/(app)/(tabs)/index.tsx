import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useDashboardData } from "@/db/local-workspace-state";
import { buildDashboardView, localIsoDate } from "@/features/dashboard/dashboard-view";
import { useSyncState } from "@/sync/sync-state";
import {
  Card,
  EmptyState,
  ErrorState,
  MoneyValue,
  OfflineBanner,
  Skeleton,
  SyncStatus,
} from "@/ui/components";
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
      <SectionLabel>Balance</SectionLabel>
      <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} />
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Calculated from your recorded ledger. It may omit activity from before tracking began.
      </Text>
      {balances && balances.items.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {balances.items.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <Text
                numberOfLines={1}
                style={[typography.body, { color: theme.colors.text, flex: 1 }]}
              >
                {account.name}
              </Text>
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
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Money in</Text>
        <MoneyValue amountMinor={metrics.moneyInMinor} tone="income" />
      </View>
      <View style={styles.metricRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Money out</Text>
        <MoneyValue amountMinor={-metrics.moneyOutMinor} tone="expense" />
      </View>
      <View style={styles.metricRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Net</Text>
        <MoneyValue
          amountMinor={metrics.netMinor}
          tone={metrics.netMinor >= 0 ? "income" : "expense"}
        />
      </View>
      <View style={styles.metricRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Savings rate</Text>
        <Text style={[typography.body, { color: theme.colors.text }]}>
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
                  style={[styles.fill, { width: (percent + "%") as DimensionValue, backgroundColor: item.color }]}
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
  const max = cashflow.points.reduce(
    (largest, point) => Math.max(largest, point.incomeMinor, point.expenseMinor),
    0,
  );
  const title = CASHFLOW_VIEWS.find((option) => option.value === selectedView)?.title ?? "Cash flow";
  return (
    <Card accessibilityLabel={title}>
      <SectionLabel>{title}</SectionLabel>
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
      <View style={{ gap: spacing.sm }}>
        {cashflow.points.map((point) => {
          const net = point.incomeMinor - point.expenseMinor;
          const percent =
            max <= 0
              ? 0
              : Math.round((Math.max(point.incomeMinor, point.expenseMinor) / max) * 100);
          const label =
            cashflow.granularity === "month" ? point.date.slice(0, 7) : point.date.slice(5);
          return (
            <View
              key={point.date}
              accessible
              accessibilityLabel={label + ": income " + point.incomeMinor + ", expense " + point.expenseMinor}
            >
              <View style={styles.cashflowRow}>
                <Text style={[typography.caption, { color: theme.colors.textMuted, width: 44 }]}>
                  {label}
                </Text>
                <View style={[styles.track, { backgroundColor: theme.colors.border, flex: 1 }]}>
                  <View
                    style={[styles.fill, { width: (percent + "%") as DimensionValue, backgroundColor: theme.colors.income }]}
                  />
                </View>
                <MoneyValue amountMinor={net} tone={net >= 0 ? "income" : "expense"} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function BudgetCard({ summary }: { summary: DashboardSummary }) {
  return (
    <Card>
      <SectionLabel>Budgets</SectionLabel>
      {summary.budgetProgress.length === 0 ? (
        <EmptyState
          title="No monthly budget yet"
          description="Budget limits will use the same server-authoritative semantics as Zoption web."
        />
      ) : null}
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
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cashflowRow: {
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
