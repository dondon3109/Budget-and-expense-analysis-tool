import { OPENING_BALANCE_CATEGORY_SYSTEM_KEY, type CashflowTrend } from "@zoption/shared";
import { router } from "expo-router";

import { openBills } from "@/features/budgets/open-bills";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { useDashboardData, useSubscriptions } from "@/db/local-workspace-state";
import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { FamilyClosingNotice } from "@/features/family/FamilyClosingNotice";
import { FamilyHomeJustYouCard } from "@/features/family/JustYouCard";
import { RemittanceCard } from "@/features/family/RemittanceCard";
import { SharedBalancesCard } from "@/features/family/SharedBalancesCard";
import { useOnboardingPrompt } from "@/features/onboarding/use-onboarding-prompt";
import { PetMomentModal } from "@/features/pet/PetMomentModal";
import { usePetIntroPrompt } from "@/features/pet/use-pet-intro-prompt";
import { useGoalPrompt } from "@/features/primary-goal/goal-personalization";
import { PreferenceSuggestionsCard } from "@/features/primary-goal/PreferenceSuggestionsCard";
import { RemittanceCalculatorCard } from "@/features/remittance/RemittanceCalculatorCard";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  Card,
  ErrorState,
  OfflineBanner,
  Skeleton,
  SyncStatus,
  ViewSwitch,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { BalanceCard } from "./BalanceCard";
import { BudgetCard } from "./BudgetCard";
import { CashflowCard } from "./CashflowCard";
import { CashflowForecastCard } from "./CashflowForecastCard";
import {
  buildDashboardCashflow,
  buildDashboardOverview,
  isEstablishedLedger,
  localIsoDate,
} from "./dashboard-view";
import { HomeEmptyView } from "./HomeEmptyView";
import { MonthSummaryCard } from "./MonthSummaryCard";
import { QuickActionBar } from "./QuickActionBar";
import { QuickStartGuideCard } from "./QuickStartGuideCard";
import { SubscriptionsSection } from "./SubscriptionsSection";
import { SafeToSpendHero } from "./SafeToSpendHero";
import { TopCategorySection } from "./TopCategorySection";
import { WorkspaceMenu, type HomeMenuView } from "./WorkspaceMenu";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { SpendingByCategory } from "./SpendingByCategory";

type HomeViewName = "overview" | "analytics";

const HOME_VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "analytics", label: "Analytics" },
] as const;

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
  useOnboardingPrompt();
  useGoalPrompt();
  usePetIntroPrompt();
  const theme = useZoptionTheme();
  const onboardingState = useOnboardingStore((store) => store.state);
  const sync = useSyncState();
  // A guest never syncs, so the pill says where the data lives instead of "Waiting to sync".
  const guest = useSessionSnapshot().status === "guest";
  const planState = usePlan();
  const workspaceCurrency = useWorkspaceCurrency();
  // A family has no subscriptions, goals, or setup guide, so their cards stay personal.
  const inFamily = useActiveWorkspace().family !== null;
  const [menuView, setMenuView] = useState<HomeMenuView>("home");
  const { openFeature } = useAccountGate();
  const [homeView, setHomeView] = useState<HomeViewName>("overview");
  const [cashflowView, setCashflowView] = useState<CashflowTrend["view"]>("weekly");
  const overview = useMemo(
    () =>
      dashboard.data ? buildDashboardOverview(dashboard.data, today, workspaceCurrency) : null,
    [dashboard.data, today, workspaceCurrency],
  );
  const cashflow = useMemo(
    () =>
      dashboard.data && homeView === "analytics"
        ? buildDashboardCashflow(dashboard.data, today, cashflowView, workspaceCurrency)
        : null,
    [dashboard.data, homeView, today, cashflowView, workspaceCurrency],
  );
  // Exclude starter accounts and the system opening-balance entry so new users actually see the
  // empty state and their goal CTA before logging their first real transaction.
  const hasRealRecentTransaction = Boolean(
    dashboard.data?.recentTransactions.some(
      (item) => item.categorySystemKey !== OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
    ),
  );
  const hasTransactions = Boolean(
    overview && (overview.summary.monthlyTrend.length > 0 || hasRealRecentTransaction),
  );
  const showQuickStartGuide = Boolean(
    hasTransactions && dashboard.data && !isEstablishedLedger(dashboard.data, today),
  );
  const canResumeSetup =
    !guest && !inFamily && onboardingState !== null && onboardingState.step !== "complete";
  const isPaid = planState.plan !== null && planState.plan !== "free";
  const showViewSwitch = menuView === "home" && !dashboard.error && hasTransactions;

  const handleRefresh = useCallback(async () => {
    sync.retry();
    dashboard.retry();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [dashboard, sync]);

  return (
    <Screen
      onRefresh={handleRefresh}
      refreshing={sync.status === "syncing"}
      showHeading={false}
      title="Home"
    >
      <PetMomentModal />
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <WorkspaceMenu
            selected={menuView}
            onSelect={setMenuView}
            onOpenFamilies={() => openFeature("family", "/(app)/family")}
            onOpenFamilySettings={() => router.push("/(app)/family")}
            onOpenBudgetCalculator={() => router.push("/(app)/budget-calculator")}
            onOpenPet={() => openFeature("pet", "/(app)/pet")}
          />
        </View>
        {showViewSwitch ? (
          <ViewSwitch options={HOME_VIEWS} selected={homeView} onSelect={setHomeView} />
        ) : null}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <SyncStatus
            state={guest ? "pending" : visibleSyncState(sync.status)}
            detail={sync.message}
            onRetry={sync.retry}
          />
        </View>
      </View>
      <FamilyClosingNotice />
      <FamilyHomeJustYouCard />
      <OfflineBanner />
      {menuView === "remittance" ? (
        <RemittanceCalculatorCard />
      ) : dashboard.error ? (
        <ErrorState
          message={dashboard.error}
          onRetry={dashboard.retry}
          title="Local data unavailable"
        />
      ) : !overview ? (
        <View accessibilityLabel="Loading dashboard" style={{ gap: spacing.sm }}>
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <QuickActionBar />
          {inFamily ? (
            <>
              <RemittanceCard month={`${today.slice(0, 7)}-01`} />
              <SharedBalancesCard />
            </>
          ) : null}
          {canResumeSetup ? (
            <Card accessibilityLabel="Finish workspace setup">
              <View style={{ gap: spacing.xs }}>
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  Finish setting up your workspace
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  Pick your base currency and starting cash so your totals match reality.
                </Text>
                <Button size="compact" onPress={() => router.push("/(app)/onboarding")}>
                  Resume setup
                </Button>
              </View>
            </Card>
          ) : null}
          {inFamily ? null : (
            <>
              {showQuickStartGuide ? (
                <QuickStartGuideCard
                  firstAccountId={overview.summary.accountBalances?.items[0]?.id}
                />
              ) : null}
              <PreferenceSuggestionsCard
                hasBudget={overview.summary.budgetProgress.some((item) => item.limitMinor > 0)}
                hasSubscription={subscriptions.subscriptions.length > 0}
                subscriptionsLoading={subscriptions.loading}
              />
            </>
          )}
          {hasTransactions ? (
            <>
              {homeView === "overview" ? (
                <>
                  <BalanceCard summary={overview.summary} />
                  {inFamily ? null : (
                    <>
                      <SafeToSpendHero
                        startingBalanceMinor={overview.accountBalances.overallBalanceMinor}
                        subscriptions={subscriptions.subscriptions}
                        remainingBudgetMinor={
                          overview.summary.budgetProgress.length > 0
                            ? Math.max(
                                0,
                                overview.summary.budgetProgress.reduce(
                                  (sum, item) => sum + item.remainingMinor,
                                  0,
                                ),
                              )
                            : undefined
                        }
                        onViewRenewals={() => openBills()}
                      />
                      <SubscriptionsSection subscriptions={subscriptions.subscriptions} />
                    </>
                  )}
                  <TopCategorySection
                    summary={overview.summary}
                    onViewAll={() => setHomeView("analytics")}
                  />
                </>
              ) : (
                <>
                  <MonthSummaryCard summary={overview.summary} />
                  {cashflow ? (
                    <CashflowCard
                      cashflow={cashflow}
                      isPaid={isPaid}
                      onSelectView={setCashflowView}
                      selectedView={cashflowView}
                    />
                  ) : null}
                  <SpendingByCategory summary={overview.summary} />
                  <BudgetCard summary={overview.summary} />
                  {inFamily ? null : (
                    <CashflowForecastCard
                      startingBalanceMinor={overview.accountBalances.overallBalanceMinor}
                      subscriptions={subscriptions.subscriptions}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <HomeEmptyView syncing={sync.status === "syncing"} />
          )}
        </View>
      )}
    </Screen>
  );
}
