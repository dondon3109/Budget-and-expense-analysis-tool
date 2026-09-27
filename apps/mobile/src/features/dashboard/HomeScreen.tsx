import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useDashboardData, useSubscriptions } from "@/db/local-workspace-state";
import { RemittanceCalculatorCard } from "@/features/remittance/RemittanceCalculatorCard";
import { useSyncState } from "@/sync/sync-state";
import { ErrorState, OfflineBanner, Skeleton, SyncPausedBanner, SyncStatus } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { spacing } from "@/ui/tokens";
import type { CashflowTrend } from "@zoption/shared";

import { BalanceCard } from "./BalanceCard";
import { BudgetCard } from "./BudgetCard";
import { CashflowCard } from "./CashflowCard";
import { CashflowForecastCard } from "./CashflowForecastCard";
import { buildDashboardView, localIsoDate } from "./dashboard-view";
import { HomeEmptyView } from "./HomeEmptyView";
import { MonthSummaryCard } from "./MonthSummaryCard";
import { QuickActionBar } from "./QuickActionBar";
import { QuickStartGuideCard } from "./QuickStartGuideCard";
import { RecentActivityCard } from "./RecentActivityCard";
import { SafeToSpendHero } from "./SafeToSpendHero";
import { SpendingByCategory } from "./SpendingByCategory";

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

export function HomeScreen() {
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
