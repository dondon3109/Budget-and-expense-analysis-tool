import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useDashboardData, useSubscriptions } from "@/db/local-workspace-state";
import { CashflowForecastCard } from "@/features/dashboard/CashflowForecastCard";
import { RemittanceCalculatorCard } from "@/features/remittance/RemittanceCalculatorCard";
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
  SyncPausedBanner,
  SyncStatus,
  TransactionRow,
} from "@/ui/components";
import { fullDateLabel } from "@/ui/components/cashflow-chart-geometry";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import type { CashflowTrend, DashboardSummary, TransactionRecord } from "@zoption/shared";

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

function QuickActionBar() {
  const theme = useZoptionTheme();
  return (
    <View accessibilityLabel="Quick actions" style={styles.quickActionsGrid}>
      <Pressable
        accessibilityLabel="Add transaction"
        accessibilityHint="Opens the new transaction form"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/transaction")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Add
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Scan receipt"
        accessibilityHint="Opens camera to scan a receipt"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/receipt-scan")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="camera-outline" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Scan
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="View budgets"
        accessibilityHint="Opens category budgets overview"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/(tabs)/budgets")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="chart-donut" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Budgets
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="AI Assistant"
        accessibilityHint="Opens financial AI assistant"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/assistant")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons
            name="chat-processing-outline"
            size={20}
            color={theme.colors.brand}
          />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Assistant
        </Text>
      </Pressable>
    </View>
  );
}

function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  const netMinor = summary.metrics.netMinor;
  const isNetPositive = netMinor >= 0;

  return (
    <Card accessibilityLabel="Account balances">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Total Balance</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage accounts"
          onPress={() => router.push("/(app)/money-setup")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            Accounts
          </Text>
        </Pressable>
      </View>
      <View style={styles.balanceHeroRow}>
        <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} style={styles.heroMoney} />
        <View
          style={[
            styles.netChangePill,
            {
              backgroundColor: isNetPositive ? theme.colors.brandSoft : theme.colors.dangerSoft,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={isNetPositive ? "trending-up" : "trending-down"}
            size={14}
            color={isNetPositive ? theme.colors.income : theme.colors.expense}
          />
          <MoneyValue
            amountMinor={netMinor}
            tone={isNetPositive ? "income" : "expense"}
            style={styles.netPillMoney}
          />
          <Text
            style={[
              typography.caption,
              {
                color: isNetPositive ? theme.colors.income : theme.colors.expense,
                fontWeight: "700",
              },
            ]}
          >
            this month
          </Text>
        </View>
      </View>
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
                  <MaterialCommunityIcons
                    name={account.currency === "USD" ? "currency-usd" : "wallet-outline"}
                    size={18}
                    color={theme.colors.brand}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {account.name}
                </Text>
                {account.currency === "USD" ? (
                  <View
                    style={[
                      styles.currencyTag,
                      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                    ]}
                  >
                    <Text style={[typography.caption, { color: theme.colors.textMuted, fontSize: 10 }]}>
                      USD
                    </Text>
                  </View>
                ) : null}
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
      <View style={styles.cardHeaderRow}>
        <SectionLabel>This month</SectionLabel>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {summary.period.from} to {summary.period.to}
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        {/* Money in */}
        <View
          style={[
            styles.summaryTile,
            { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.summaryTileHeader}>
            <View
              accessibilityElementsHidden
              style={[styles.metricIconWrap, { backgroundColor: theme.colors.brandSoft }]}
            >
              <MaterialCommunityIcons
                name="arrow-down-left"
                size={16}
                color={theme.colors.income}
              />
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Money in</Text>
          </View>
          <MoneyValue amountMinor={metrics.moneyInMinor} tone="income" style={typography.headline} />
        </View>

        {/* Money out */}
        <View
          style={[
            styles.summaryTile,
            { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.summaryTileHeader}>
            <View
              accessibilityElementsHidden
              style={[styles.metricIconWrap, { backgroundColor: theme.colors.dangerSoft }]}
            >
              <MaterialCommunityIcons
                name="arrow-up-right"
                size={16}
                color={theme.colors.expense}
              />
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Money out</Text>
          </View>
          <MoneyValue amountMinor={-metrics.moneyOutMinor} tone="expense" style={typography.headline} />
        </View>

        {/* Net flow */}
        <View
          style={[
            styles.summaryTile,
            { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.summaryTileHeader}>
            <View
              accessibilityElementsHidden
              style={[styles.metricIconWrap, { backgroundColor: theme.colors.surfaceRaised }]}
            >
              <MaterialCommunityIcons name="scale-balance" size={16} color={theme.colors.brand} />
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Net flow</Text>
          </View>
          <MoneyValue
            amountMinor={metrics.netMinor}
            tone={metrics.netMinor >= 0 ? "income" : "expense"}
            style={typography.headline}
          />
        </View>

        {/* Savings rate */}
        <View
          style={[
            styles.summaryTile,
            { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.summaryTileHeader}>
            <View
              accessibilityElementsHidden
              style={[styles.metricIconWrap, { backgroundColor: theme.colors.surfaceRaised }]}
            >
              <MaterialCommunityIcons
                name="piggy-bank-outline"
                size={16}
                color={theme.colors.brand}
              />
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Savings rate</Text>
          </View>
          <Text style={[typography.headline, { color: theme.colors.text, fontWeight: "700" }]}>
            {insights.savingsRatePercent === null ? "—" : `${insights.savingsRatePercent}%`}
          </Text>
        </View>
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
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Spending by category</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View category budgets"
          onPress={() => router.push("/(app)/(tabs)/budgets")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            Budgets
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.sm }}>
        {summary.spendingByCategory.map((item) => {
          const percent = max <= 0 ? 0 : Math.round((item.amountMinor / max) * 100);
          return (
            <View
              key={item.categoryId}
              accessible
              accessibilityLabel={`${item.name}: ${item.sharePercent} percent of spending`}
            >
              <View style={styles.categoryRow}>
                {item.iconEmoji ? (
                  <Text accessibilityElementsHidden style={styles.categoryEmoji}>
                    {item.iconEmoji}
                  </Text>
                ) : (
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                )}
                <Text
                  numberOfLines={1}
                  style={[typography.body, { color: theme.colors.text, flex: 1 }]}
                >
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.shareBadge,
                    { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
                  ]}
                >
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    {item.sharePercent}%
                  </Text>
                </View>
                <MoneyValue amountMinor={-item.amountMinor} tone="expense" />
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
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
            <Button variant="secondary" onPress={() => router.push("/(app)/(tabs)/budgets")}>
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
                        backgroundColor: overBudget
                          ? theme.colors.dangerSoft
                          : theme.colors.canvasMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: overBudget ? theme.colors.danger : theme.colors.textMuted,
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
      )}
    </Card>
  );
}

function RecentActivityCard({ transactions }: { transactions: TransactionRecord[] }) {
  const theme = useZoptionTheme();
  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 3),
    [transactions],
  );

  if (recent.length === 0) return null;

  return (
    <Card accessibilityLabel="Recent transactions">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Recent activity</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all transactions"
          onPress={() => router.push("/(app)/(tabs)/transactions")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            View all
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.xs }}>
        {recent.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={{
              ...tx,
              accountId: null,
              notes: null,
            }}
            onPress={() =>
              router.push({
                pathname: "/(app)/transaction",
                params: { id: tx.id },
              })
            }
          />
        ))}
      </View>
    </Card>
  );
}

function HomeEmptyView({ syncing }: { syncing: boolean }) {
  const theme = useZoptionTheme();

  if (syncing) {
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
            name="cloud-sync-outline"
            size={34}
            color={theme.colors.brand}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
        >
          Checking your workspace…
        </Text>
        <Text
          style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}
        >
          Synchronizing your encrypted financial workspace records.
        </Text>
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
        <MaterialCommunityIcons
          name="wallet-plus-outline"
          size={36}
          color={theme.colors.brand}
        />
      </View>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
      >
        Welcome to your workspace
      </Text>
      <Text
        style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}
      >
        Take control of your money with offline-first tracking, smart receipt scans, and category budgeting.
      </Text>

      <View style={styles.onboardingSteps}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 1: Set up accounts and categories"
          onPress={() => router.push("/(app)/money-setup")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              1
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Set up accounts &amp; categories
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Create cash, bank, or e-wallet accounts and customize tags.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 2: Add your first transaction"
          onPress={() => router.push("/(app)/transaction")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              2
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Add transaction or scan receipt
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Log daily spending or snap a receipt to auto-draft expenses.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 3: Set category budgets"
          onPress={() => router.push("/(app)/(tabs)/budgets")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              3
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Set monthly budget limits
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Keep food, utilities, and shopping expenses in check.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const dashboard = useDashboardData();
  const subscriptions = useSubscriptions();
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
  const hasTransactions = Boolean(
    view &&
      (view.summary.monthlyTrend.length > 0 ||
        (dashboard.data?.transactions.length ?? 0) > 0 ||
        (dashboard.data?.accounts.length ?? 0) > 0),
  );
  const isPro = planState.plan === "zoption_pro";

  const handleRefresh = useCallback(async () => {
    sync.retry();
    dashboard.retry();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [dashboard, sync]);

  return (
    <Screen
      action={<SyncStatus state={visibleSyncState(sync.status)} />}
      onRefresh={handleRefresh}
      refreshing={sync.status === "syncing"}
      title="Home"
    >
      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <SyncPausedBanner message={sync.message} onRetry={sync.retry} />
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
      ) : (
        <View style={{ gap: spacing.md }}>
          <QuickActionBar />
          {hasTransactions ? (
            <>
              <BalanceCard summary={view.summary} />
              <MonthSummaryCard summary={view.summary} />
              <SpendingByCategory summary={view.summary} />
              <CashflowCard
                cashflow={view.cashflow}
                isPro={isPro}
                onSelectView={setCashflowView}
                selectedView={cashflowView}
              />
              <CashflowForecastCard
                startingBalanceMinor={view.accountBalances.overallBalanceMinor}
                subscriptions={subscriptions.subscriptions.filter((sub) => sub.status === "active")}
              />
              <RemittanceCalculatorCard />
              <BudgetCard summary={view.summary} />
              <RecentActivityCard transactions={dashboard.data?.transactions ?? []} />
            </>
          ) : (
            <HomeEmptyView syncing={sync.status === "syncing"} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickActionsGrid: {
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  quickActionTile: {
    flex: 1,
    minHeight: touchTarget + spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  quickActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  heroMoney: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
  },
  balanceHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginVertical: spacing.xxs,
  },
  netChangePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  netPillMoney: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
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
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyTag: {
    paddingHorizontal: spacing.xxs + 2,
    paddingVertical: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  summaryTile: {
    flex: 1,
    minWidth: "47%",
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  summaryTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  categoryEmoji: { width: 24, fontSize: 19, lineHeight: 24 },
  shareBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
    borderWidth: 1,
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
  budgetStatusPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
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
    width: 10,
    height: 10,
    borderRadius: radii.round,
  },
  track: {
    height: 6,
    borderRadius: radii.round,
    overflow: "hidden",
    marginTop: spacing.xxs,
  },
  fill: {
    height: 6,
    borderRadius: radii.round,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xl,
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
    maxWidth: 340,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  onboardingSteps: {
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
