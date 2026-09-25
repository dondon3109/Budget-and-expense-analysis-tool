import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useDashboardData, useSubscriptions } from "@/db/local-workspace-state";
import { CashflowForecastCard } from "@/features/dashboard/CashflowForecastCard";
import { SafeToSpendHero } from "@/features/dashboard/SafeToSpendHero";
import { QuickStartGuideCard } from "@/features/dashboard/QuickStartGuideCard";
import { RemittanceCalculatorCard } from "@/features/remittance/RemittanceCalculatorCard";
import { balanceAllocation } from "@/features/dashboard/balance-allocation";
import { buildDashboardView, localIsoDate } from "@/features/dashboard/dashboard-view";
import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";
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
import {
  preferredTransactionAccount,
  type AccountBalanceSummaryItem,
  type AccountType,
  type CashflowTrend,
  type DashboardSummary,
  type TransactionRecord,
} from "@zoption/shared";

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
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
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
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
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
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
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
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
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

const ACCOUNT_TYPE_ICONS: Record<AccountType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  cash: "cash",
  checking: "bank-outline",
  savings: "piggy-bank-outline",
  credit: "credit-card-outline",
  other: "wallet-outline",
};

function accountSubtitle(
  account: AccountBalanceSummaryItem,
  sharePercent: number | undefined,
): string {
  if (account.archived) return "Archived";
  if (account.currency === "USD") return "Held in USD";
  if (account.balanceMinor < 0) return "Owed";
  if (sharePercent === undefined) return "No balance";
  return `${sharePercent}% of assets`;
}

function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  const items = balances?.items ?? [];
  const netMinor = summary.metrics.netMinor;
  const isNetPositive = netMinor >= 0;
  const usdMinor = balances?.balancesByCurrency.USD ?? 0;
  const defaultSpendingAccountId = useDefaultSpendingAccountStore((state) => state.accountId);
  const setDefaultSpendingAccountId = useDefaultSpendingAccountStore((state) => state.setAccountId);
  const defaultSpendingAccount = preferredTransactionAccount(
    items.filter((account) => !account.archived),
    defaultSpendingAccountId,
  );
  const allocation = balanceAllocation(items);
  // Series colors come from theme tokens so the bar reads in every theme. The
  // expense tone is left out so no account reads as negative; any account past
  // the fifth shares the muted tone.
  const palette = [
    theme.colors.brand,
    theme.colors.info,
    theme.colors.budget,
    theme.colors.warning,
    theme.colors.text,
  ];
  const slices = allocation.slices.map((slice, index) => ({
    ...slice,
    color: palette[index] ?? theme.colors.textMuted,
  }));
  const sliceById = new Map(slices.map((slice) => [slice.id, slice]));

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
            Manage
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.xs }}>
        <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} style={styles.heroMoney} />
        <View style={styles.heroMetaRow}>
          <View
            style={[
              styles.netChangePill,
              { backgroundColor: isNetPositive ? theme.colors.brandSoft : theme.colors.dangerSoft },
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
                { color: isNetPositive ? theme.colors.income : theme.colors.expense },
              ]}
            >
              this month
            </Text>
          </View>
          {usdMinor !== 0 ? (
            <View style={styles.usdMeta}>
              {usdMinor > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>+</Text>
              ) : null}
              <MoneyValue
                amountMinor={usdMinor}
                currency="USD"
                tone={usdMinor < 0 ? "expense" : "default"}
                style={styles.metaMoney}
              />
            </View>
          ) : null}
        </View>
      </View>

      {slices.length > 0 ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Balance split: ${slices
            .map((slice) => `${slice.name} ${slice.sharePercent} percent`)
            .join(", ")}`}
          style={[styles.allocationBar, { backgroundColor: theme.colors.canvasMuted }]}
        >
          {slices.map((slice) => (
            <View
              key={slice.id}
              style={{ flex: slice.balanceMinor, backgroundColor: slice.color }}
            />
          ))}
        </View>
      ) : null}

      {allocation.liabilitiesMinor < 0 ? (
        <View style={styles.cardHeaderRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Total owed</Text>
          <MoneyValue
            amountMinor={allocation.liabilitiesMinor}
            tone="expense"
            style={styles.metaMoney}
          />
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={[styles.accountList, { borderTopColor: theme.colors.border }]}>
          {items.map((account) => {
            const isDefaultSpending = account.id === defaultSpendingAccount?.id;
            const slice = sliceById.get(account.id);
            const accent = slice?.color ?? theme.colors.textMuted;
            return (
              <View key={account.id} style={styles.accountRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${account.name}, balance ${account.balanceMinor / 100} ${account.currency}. Tap to adjust balance or edit.`}
                  accessibilityHint="Opens account editor to adjust balance"
                  android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
                  onPress={() =>
                    router.push(`/(app)/reference?entityType=account&id=${account.id}`)
                  }
                  style={({ pressed }) => [styles.accountRowMain, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <View
                    accessibilityElementsHidden
                    style={[styles.accountIconBox, { backgroundColor: theme.colors.canvasMuted }]}
                  >
                    <MaterialCommunityIcons
                      name={ACCOUNT_TYPE_ICONS[account.type]}
                      size={18}
                      color={accent}
                    />
                  </View>
                  <View style={styles.accountText}>
                    <Text
                      numberOfLines={1}
                      style={[typography.label, { color: theme.colors.text }]}
                    >
                      {account.name}
                    </Text>
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      {accountSubtitle(account, slice?.sharePercent)}
                    </Text>
                  </View>
                  <MoneyValue
                    amountMinor={account.balanceMinor}
                    currency={account.currency}
                    tone={account.balanceMinor < 0 ? "expense" : "default"}
                    style={styles.accountMoney}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${account.name} as the default spending account`}
                  accessibilityState={{ selected: isDefaultSpending }}
                  disabled={account.archived}
                  hitSlop={4}
                  onPress={() => setDefaultSpendingAccountId(account.id)}
                  style={styles.accountDefaultButton}
                >
                  <MaterialCommunityIcons
                    color={isDefaultSpending ? theme.colors.brand : theme.colors.textMuted}
                    name={isDefaultSpending ? "star" : "star-outline"}
                    size={20}
                  />
                </Pressable>
              </View>
            );
          })}
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Tap an account to adjust its balance. The starred account is where new transactions
            start.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

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

function MonthSummaryCard({ summary }: { summary: DashboardSummary }) {
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

function SpendingByCategory({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const categories = summary.spendingByCategory;
  const max = categories.reduce((largest, item) => Math.max(largest, item.amountMinor), 0);
  if (categories.length === 0) {
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
      )}
    </Card>
  );
}

// `recent` is the dashboard's separate newest-first read, already limited to
// the rows this card renders.
function RecentActivityCard({ recent }: { recent: TransactionRecord[] }) {
  const theme = useZoptionTheme();

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
          <MaterialCommunityIcons name="cloud-sync-outline" size={34} color={theme.colors.brand} />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
        >
          Checking your workspace…
        </Text>
        <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
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
        <MaterialCommunityIcons name="wallet-plus-outline" size={36} color={theme.colors.brand} />
      </View>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
      >
        Welcome to your workspace
      </Text>
      <Text style={[typography.headline, { color: theme.colors.text, textAlign: "center" }]}>
        Build your real financial picture
      </Text>
      <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
        Your workspace starts clean without fictional transactions. Choose how you want to begin:
        migrate existing bank or Excel statements in under a minute, or build clean as you go.
      </Text>

      <View style={{ width: "100%", gap: spacing.sm, marginTop: spacing.xs }}>
        <Card accessibilityLabel="Option A: Bring your data">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons
                name="file-excel-outline"
                size={20}
                color={theme.colors.brand}
              />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Option A: Bring your data
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Upload Excel sheets or bank CSVs with automated column matching and duplicate checks.
            </Text>
            <View style={{ marginTop: spacing.xs }}>
              <Button
                accessibilityHint="Opens the guided 3-step bank file import"
                onPress={() =>
                  router.push({ pathname: "/(app)/import", params: { firstRun: "1" } })
                }
              >
                Bring your data (File import)
              </Button>
            </View>
          </View>
        </Card>

        <Card accessibilityLabel="Option B: Start fresh">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.brand} />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Option B: Start fresh
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Configure your accounts and track spending with voice or manual entries.
            </Text>
            <View style={{ marginTop: spacing.xs }}>
              <Button
                variant="secondary"
                accessibilityHint="Opens manual transaction entry"
                onPress={() => router.push("/(app)/transaction")}
              >
                Start fresh (Add transaction)
              </Button>
            </View>
          </View>
        </Card>
      </View>

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
  // One local date for both the query window and the aggregation, so the
  // chart can never read a window the query did not load.
  const today = localIsoDate(new Date());
  const dashboard = useDashboardData(today);
  const subscriptions = useSubscriptions();
  const sync = useSyncState();
  const planState = usePlan();
  const [cashflowView, setCashflowView] = useState<CashflowTrend["view"]>("weekly");
  const view = useMemo(
    () => (dashboard.data ? buildDashboardView(dashboard.data, today, cashflowView) : null),
    [dashboard.data, today, cashflowView],
  );
  const hasTransactions = Boolean(
    view &&
    (view.summary.monthlyTrend.length > 0 ||
      (dashboard.data?.recentTransactions.length ?? 0) > 0 ||
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
          {hasTransactions ? <BalanceCard summary={view.summary} /> : null}
          <QuickActionBar />
          <QuickStartGuideCard firstAccountId={view.summary.accountBalances?.items[0]?.id} />
          {hasTransactions ? (
            <>
              <SafeToSpendHero
                startingBalanceMinor={view.accountBalances.overallBalanceMinor}
                subscriptions={subscriptions.subscriptions.filter((sub) => sub.status === "active")}
                remainingBudgetMinor={
                  view.summary.budgetProgress.length > 0
                    ? Math.max(
                        0,
                        view.summary.budgetProgress.reduce(
                          (sum, item) => sum + item.remainingMinor,
                          0,
                        ),
                      )
                    : undefined
                }
                onViewRenewals={() => router.push("/(app)/subscriptions")}
              />
              <MonthSummaryCard summary={view.summary} />
              <CashflowCard
                cashflow={view.cashflow}
                isPro={isPro}
                onSelectView={setCashflowView}
                selectedView={cashflowView}
              />
              <SpendingByCategory summary={view.summary} />
              <BudgetCard summary={view.summary} />
              <RecentActivityCard recent={dashboard.data?.recentTransactions ?? []} />
              <CashflowForecastCard
                startingBalanceMinor={view.accountBalances.overallBalanceMinor}
                subscriptions={subscriptions.subscriptions.filter((sub) => sub.status === "active")}
              />
              <RemittanceCalculatorCard />
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
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  usdMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metaMoney: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  allocationBar: {
    flexDirection: "row",
    height: 10,
    gap: 2,
    borderRadius: radii.round,
    overflow: "hidden",
  },
  accountList: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
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
    gap: spacing.xxs,
  },
  accountRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
  },
  accountDefaultButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
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
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  categoryEmoji: { width: 24, fontSize: 19, lineHeight: 24 },
  categoryMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
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
  firstRunImport: {
    width: "100%",
    gap: spacing.xs,
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
