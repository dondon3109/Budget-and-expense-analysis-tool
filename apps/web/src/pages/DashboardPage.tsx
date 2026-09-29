import type {
  AccountBalanceSummaryItem,
  Currency,
  CashflowTrendView,
  TransactionListQuery,
} from "@zoption/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  PiggyBank,
  Plus,
  Receipt,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { useAccountMutations } from "../components/dashboard/useAccountMutations";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { AdjustBalanceModal } from "../components/account/AdjustBalanceModal";
import { Skeleton, SkeletonStatus } from "../components/common/Skeleton";
import { ProCheckoutDialog } from "../components/billing/ProCheckoutDialog";
import { AccountsPanel } from "../components/dashboard/AccountsPanel";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { DashboardToolCards } from "../components/dashboard/DashboardToolCards";
import { DashboardTransactionHistory } from "../components/dashboard/DashboardTransactionHistory";
import { GoalsSubscriptionPanel } from "../components/dashboard/GoalsSubscriptionPanel";
import { OverviewStatBar, type OverviewStatItem } from "../components/dashboard/OverviewStatBar";
import { QuickStartTutorial } from "../components/dashboard/QuickStartTutorial";
import { SafeToSpendCard } from "../components/dashboard/SafeToSpendCard";
import { SpreadsheetMigrationWizard } from "../components/onboarding/SpreadsheetMigrationWizard";
import { useInitialDashboardExperience } from "../components/dashboard/InitialDashboardExperienceProvider";
import { MonthlyTrend } from "../components/dashboard/MonthlyTrend";
import { SpendingByCategory } from "../components/dashboard/SpendingByCategory";
import { MonthSelector } from "../components/month/MonthSelector";
import { AppShell } from "../components/layout/AppShell";
import { usePrivateAppStartupReadiness } from "../components/layout/PrivateAppStartupGate";
import { getCashflowTrend, getDashboard, getTransferFeeInsight } from "../lib/api";
import {
  currentMonth,
  daysInMonth,
  isMonth,
  localIsoDate,
  monthStart,
  shiftMonth,
} from "../lib/calendar";
import { calculatePercentageChange, isDashboardEmpty, trendState } from "../lib/dashboard";
import { formatFullMonth, formatMonth } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import { transactionsQueryOptions } from "../queries/transactions";
import "./DashboardPage.css";
// AccountsPanel.css holds the account rules that used to close DashboardPage.css, so it loads
// right after it to keep the cascade order.
import "../components/dashboard/AccountsPanel.css";

const dashboardHistoryPageSize = 8;

export function DashboardPage() {
  const { user } = useAuth();
  const { hasCompletedInitialDashboardExperience } = useInitialDashboardExperience();
  const reportStartupReadiness = usePrivateAppStartupReadiness();
  const workspace = userWorkspace(user!);
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldRestoreDashboardFocusRef = useRef(!hasCompletedInitialDashboardExperience);
  const accountMutations = useAccountMutations(workspace);
  const [adjustingAccount, setAdjustingAccount] = useState<AccountBalanceSummaryItem>();
  const [cashflowView, setCashflowView] = useState<CashflowTrendView>("weekly");
  const [historyPage, setHistoryPage] = useState(1);
  const [isProCheckoutOpen, setIsProCheckoutOpen] = useState(false);
  const [migrationWizardOpen, setMigrationWizardOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const subscribeTriggerRef = useRef<HTMLElement | null>(null);
  const handledPostAuthCheckoutIntentRef = useRef(false);

  useEffect(() => {
    if (searchParams.get("wizard") === "true") {
      setMigrationWizardOpen(true);
    }
  }, [searchParams]);
  const today = localIsoDate();
  const currentDashboardMonth = currentMonth();
  const requestedMonth = searchParams.get("month");
  const summaryMonth =
    isMonth(requestedMonth) && requestedMonth <= currentDashboardMonth
      ? requestedMonth
      : currentDashboardMonth;
  const summaryPeriod = {
    from: monthStart(summaryMonth),
    to: `${summaryMonth}-${String(daysInMonth(summaryMonth)).padStart(2, "0")}`,
  };
  const previousSummaryMonth = shiftMonth(summaryMonth, -1);
  const previousSummaryPeriod = {
    from: monthStart(previousSummaryMonth),
    to: `${previousSummaryMonth}-${String(daysInMonth(previousSummaryMonth)).padStart(2, "0")}`,
  };
  const anchorDate = summaryMonth === currentDashboardMonth ? today : summaryPeriod.to;
  const selectedMonthLabel = formatFullMonth(summaryMonth);
  const [categoryMonth, setCategoryMonth] = useState(summaryMonth);
  const categoryPeriod = {
    from: monthStart(categoryMonth),
    to: `${categoryMonth}-${String(daysInMonth(categoryMonth)).padStart(2, "0")}`,
  };
  const { data, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dashboardSummary(workspace, summaryPeriod),
    queryFn: () => getDashboard(workspace, summaryPeriod),
    placeholderData: keepPreviousData,
  });
  const previousSummaryQuery = useQuery({
    queryKey: queryKeys.dashboardSummary(workspace, previousSummaryPeriod),
    queryFn: () => getDashboard(workspace, previousSummaryPeriod),
    enabled: data !== undefined,
  });
  const categorySummaryQuery = useQuery({
    queryKey: queryKeys.dashboardSummary(workspace, categoryPeriod),
    queryFn: () => getDashboard(workspace, categoryPeriod),
    enabled: categoryMonth !== summaryMonth,
  });
  const cashflowTrendQuery = useQuery({
    queryKey: queryKeys.cashflowTrend(workspace, { view: cashflowView, anchorDate }),
    queryFn: () => getCashflowTrend(workspace, { view: cashflowView, anchorDate }),
  });
  const transferFeeInsightQuery = useQuery({
    queryKey: queryKeys.transferFeeInsight(workspace),
    queryFn: () => getTransferFeeInsight(workspace),
  });
  const historyQuery: TransactionListQuery = {
    page: historyPage,
    pageSize: dashboardHistoryPageSize,
    sortBy: "date",
    sortDirection: "desc",
  };
  const transactionHistoryQuery = useQuery({
    ...transactionsQueryOptions(workspace, historyQuery),
    placeholderData: keepPreviousData,
  });
  const billingSummary = useBillingSummary(workspace);
  const isPro = billingSummary.data?.plan === "zoption_pro";
  const hasPostAuthCheckoutIntent = searchParams.get("proCheckout") === "open";
  const isAppReady = data !== undefined;
  const isAppSettled = isAppReady || isError;

  useEffect(() => {
    reportStartupReadiness(isAppSettled);
    return () => reportStartupReadiness(false);
  }, [isAppSettled, reportStartupReadiness]);

  useEffect(() => {
    if (!hasCompletedInitialDashboardExperience || !shouldRestoreDashboardFocusRef.current) {
      return undefined;
    }

    shouldRestoreDashboardFocusRef.current = false;
    const focusFrame = window.requestAnimationFrame(() => {
      const activeDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!activeDialog) dashboardHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [hasCompletedInitialDashboardExperience]);

  useEffect(() => {
    if (!hasPostAuthCheckoutIntent) {
      handledPostAuthCheckoutIntentRef.current = false;
      return;
    }
    if (
      !hasCompletedInitialDashboardExperience ||
      !billingSummary.data ||
      isProCheckoutOpen ||
      handledPostAuthCheckoutIntentRef.current
    ) {
      return;
    }

    handledPostAuthCheckoutIntentRef.current = true;
    if (billingSummary.data.plan === "free") {
      setIsProCheckoutOpen(true);
      return;
    }

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("proCheckout");
        return next;
      },
      { replace: true },
    );
  }, [
    billingSummary.data,
    hasCompletedInitialDashboardExperience,
    hasPostAuthCheckoutIntent,
    isProCheckoutOpen,
    setSearchParams,
  ]);

  function closeProCheckout() {
    setIsProCheckoutOpen(false);
    if (!hasPostAuthCheckoutIntent) return;

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("proCheckout");
        return next;
      },
      { replace: true },
    );
  }

  if (isError) {
    return (
      <AppShell>
        <div className="full-page-status error-state" role="alert">
          <strong>The dashboard could not be loaded.</strong>
          <span>{error.message}</span>
          <button className="button primary" type="button" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </AppShell>
    );
  }
  if (!data) {
    return hasCompletedInitialDashboardExperience ? (
      <AppShell>
        <div className="dashboard-page dashboard-refetch-skeleton">
          <SkeletonStatus label="Refreshing your dashboard" className="dashboard-refetch-grid">
            <Skeleton height={124} radius="var(--radius-md)" />
            <Skeleton height={124} radius="var(--radius-md)" />
            <Skeleton height={124} radius="var(--radius-md)" />
            <Skeleton height={280} radius="var(--radius-lg)" />
          </SkeletonStatus>
        </div>
      </AppShell>
    ) : null;
  }

  const { metrics } = data;
  const accountBalances = data.accountBalances;
  const activeAccounts = [...(accountBalances?.items ?? [])]
    .filter((account) => !account.archived)
    .sort((left, right) => {
      if (left.name === "Cash") return -1;
      if (right.name === "Cash") return 1;
      return left.name.localeCompare(right.name);
    });
  const empty =
    transactionHistoryQuery.data !== undefined &&
    isDashboardEmpty(data, cashflowTrendQuery.data, transactionHistoryQuery.data.total);
  // Totals lead with the workspace currency; the other currency follows as a secondary line.
  const baseCurrency = data.currency;
  const otherCurrency: Currency = baseCurrency === "PHP" ? "USD" : "PHP";
  const overallBalanceMinor = accountBalances?.balancesByCurrency[baseCurrency] ?? 0;
  const transferFeeInsight = transferFeeInsightQuery.data;
  const transferNoun =
    transferFeeInsight?.totalFeeChargedTransfers === 1 ? "transfer" : "transfers";
  const transferFeeOtherMinor = transferFeeInsight?.feesByCurrency[otherCurrency] ?? 0;
  const previousMetrics = previousSummaryQuery.data?.metrics;
  const currentNetMinor =
    metrics.incomeByCurrency[baseCurrency] - metrics.expenseByCurrency[baseCurrency];
  const previousNetMinor = previousMetrics
    ? previousMetrics.incomeByCurrency[baseCurrency] -
      previousMetrics.expenseByCurrency[baseCurrency]
    : 0;
  const incomeChangePercent = calculatePercentageChange(
    metrics.incomeByCurrency[baseCurrency],
    previousMetrics?.incomeByCurrency[baseCurrency] ?? 0,
  );
  const expenseChangePercent = calculatePercentageChange(
    metrics.expenseByCurrency[baseCurrency],
    previousMetrics?.expenseByCurrency[baseCurrency] ?? 0,
  );
  const netChangePercent = calculatePercentageChange(currentNetMinor, previousNetMinor);
  const trendComparison = `vs ${formatMonth(previousSummaryMonth)}`;
  const overviewItems: OverviewStatItem[] = [
    {
      label: "Income",
      amounts: [
        { amountMinor: metrics.incomeByCurrency[baseCurrency], currency: baseCurrency },
        { amountMinor: metrics.incomeByCurrency[otherCurrency], currency: otherCurrency },
      ],
      detail: `Income received in ${selectedMonthLabel}`,
      icon: ArrowDownRight,
      tone: "income",
      trend: previousMetrics
        ? {
            percentage: incomeChangePercent,
            comparison: trendComparison,
            state: trendState(incomeChangePercent),
          }
        : undefined,
    },
    {
      label: "Expenses",
      amounts: [
        { amountMinor: metrics.expenseByCurrency[baseCurrency], currency: baseCurrency },
        { amountMinor: metrics.expenseByCurrency[otherCurrency], currency: otherCurrency },
      ],
      detail:
        metrics.moneyInMinor === 0
          ? `No income recorded in ${selectedMonthLabel}`
          : `${Math.round((metrics.moneyOutMinor / metrics.moneyInMinor) * 100)}% of ${selectedMonthLabel} income`,
      icon: ArrowUpRight,
      tone: "expense",
      trend: previousMetrics
        ? {
            percentage: expenseChangePercent,
            comparison: trendComparison,
            state: trendState(expenseChangePercent, false),
          }
        : undefined,
    },
    {
      label: "Transfer fees (all time)",
      amounts: [
        {
          amountMinor: transferFeeInsight?.feesByCurrency[baseCurrency] ?? 0,
          currency: baseCurrency,
        },
        ...(transferFeeOtherMinor > 0
          ? [{ amountMinor: transferFeeOtherMinor, currency: otherCurrency }]
          : []),
      ],
      detail: transferFeeInsightQuery.isPending
        ? "Loading transfer fees…"
        : transferFeeInsightQuery.isError
          ? "Transfer fees unavailable."
          : transferFeeInsight?.hasFees
            ? `Across ${transferFeeInsight.totalFeeChargedTransfers} fee-charged ${transferNoun}${
                transferFeeInsight.totalTransfers > transferFeeInsight.totalFeeChargedTransfers
                  ? ` of ${transferFeeInsight.totalTransfers} recorded transfers`
                  : ""
              }.`
            : "No transfer fees recorded yet.",
      icon: Receipt,
      tone: "expense",
    },
    {
      label: "Remaining budget",
      amounts: [{ amountMinor: metrics.remainingBudgetMinor, currency: baseCurrency }],
      detail: `${metrics.budgetUsedPercent}% of plan used`,
      icon: PiggyBank,
      tone: "plum",
    },
  ];

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Profile Overview</p>
            <h1 ref={dashboardHeadingRef} tabIndex={-1}>
              Your month, at a glance
            </h1>
            <p>See what came in, what went out, and what is still available.</p>
          </div>
          <div className="header-actions dashboard-header-actions">
            <MonthSelector
              className="dashboard-month-picker"
              label="Dashboard month"
              value={summaryMonth}
              max={currentDashboardMonth}
              onChange={(month) => {
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("month", month);
                  return next;
                });
              }}
            />
            <Link className="button secondary" to="/app/import?mode=receipt">
              <Receipt size={17} aria-hidden="true" /> Scan receipt
            </Link>
            <Link className="button primary" to="/app/transactions?add=1">
              <Plus size={17} aria-hidden="true" /> Add transaction
            </Link>
          </div>
        </header>

        <QuickStartTutorial
          onAdjustBalance={() => activeAccounts[0] && setAdjustingAccount(activeAccounts[0])}
          onMigrateSpreadsheet={() => setMigrationWizardOpen(true)}
        />

        <AccountsPanel
          accounts={accountMutations}
          accountBalances={accountBalances}
          activeAccounts={activeAccounts}
          previousMetrics={previousMetrics}
          netChangePercent={netChangePercent}
          trendComparison={trendComparison}
          isPro={isPro}
          onAdjustBalance={setAdjustingAccount}
        />

        {adjustingAccount && (
          <AdjustBalanceModal
            account={adjustingAccount}
            accounts={activeAccounts}
            onSelectAccount={(acc) => setAdjustingAccount(acc as AccountBalanceSummaryItem)}
            onClose={() => setAdjustingAccount(undefined)}
          />
        )}

        {empty ? (
          <section className="workspace-onboarding" aria-labelledby="workspace-onboarding-title">
            <div className="onboarding-copy">
              <p className="eyebrow">First-time setup</p>
              <h2 id="workspace-onboarding-title">Build your real financial picture</h2>
              <p>
                Your workspace starts clean without fictional transactions. Choose how you want to
                begin: tell us what your accounts already hold, migrate existing bank or Excel
                statements in under a minute, or build clean as you go.
              </p>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setMigrationWizardOpen(true)}
                >
                  <FileSpreadsheet size={17} aria-hidden="true" /> Bring your data (Spreadsheet
                  wizard)
                </button>
                <Link className="button secondary" to="/app/transactions?add=1">
                  <Plus size={17} aria-hidden="true" /> Add transactions manually
                </Link>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => activeAccounts[0] && setAdjustingAccount(activeAccounts[0])}
                  disabled={activeAccounts.length === 0}
                >
                  <SlidersHorizontal size={17} aria-hidden="true" /> Tell us what you already have
                </button>
              </div>
            </div>
            <div className="onboarding-steps" aria-label="Starting paths">
              <span>1</span>
              <div>
                <strong>Option A: Bring your data</strong>
                <p>
                  Upload Excel sheets or bank CSVs with automated column matching and duplicate
                  checks.
                </p>
              </div>
              <span>2</span>
              <div>
                <strong>Option B: Start fresh</strong>
                <p>Configure your accounts and track spending with voice or manual entries.</p>
              </div>
              <span>3</span>
              <div>
                <strong>Option C: Match your real balances</strong>
                <p>
                  Enter what your Cash, bank, and e-wallet accounts hold today so every number
                  starts from reality.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <OverviewStatBar items={overviewItems} />
            {summaryMonth === currentDashboardMonth && (
              <SafeToSpendCard
                workspace={workspace}
                startingBalanceMinor={overallBalanceMinor}
                remainingBudgetMinor={
                  // No budget rows means no weekly envelope to pace; the card falls back to the
                  // balance rather than reporting a plan the user never set.
                  data.budgetProgress.length > 0 ? metrics.remainingBudgetMinor : undefined
                }
              />
            )}
            <DashboardToolCards workspace={workspace} startingBalanceMinor={overallBalanceMinor} />
            <div className="dashboard-grid">
              <SpendingByCategory
                data={
                  categoryMonth === summaryMonth
                    ? data.spendingByCategory
                    : (categorySummaryQuery.data?.spendingByCategory ?? [])
                }
                month={categoryMonth}
                maxMonth={currentDashboardMonth}
                isLoading={categoryMonth !== summaryMonth && categorySummaryQuery.isPending}
                error={categoryMonth !== summaryMonth ? categorySummaryQuery.error : null}
                onMonthChange={setCategoryMonth}
                onRetry={() => void categorySummaryQuery.refetch()}
              />
              <MonthlyTrend
                data={cashflowTrendQuery.data}
                selectedView={cashflowView}
                onViewChange={setCashflowView}
                isLoading={cashflowTrendQuery.isPending}
                error={cashflowTrendQuery.error}
                onRetry={() => void cashflowTrendQuery.refetch()}
                showSubscribeToPro={billingSummary.data?.plan === "free"}
                onSubscribeToPro={(trigger) => {
                  subscribeTriggerRef.current = trigger;
                  setIsProCheckoutOpen(true);
                }}
              />
              <GoalsSubscriptionPanel workspace={workspace} />
              <BudgetProgress
                data={data.budgetProgress}
                month={summaryMonth}
                monthLabel={selectedMonthLabel}
              />
            </div>
            <details className="calculation-note">
              <summary>How these numbers are calculated</summary>
              <p>
                Income includes income transactions. Expenses include expense transactions only;
                transfers move money between accounts and do not change your overall balance.
                Remaining budget is that month’s category plan minus recorded expenses in the
                categories that have a limit, and it does not carry over.
              </p>
            </details>
            <DashboardTransactionHistory
              page={transactionHistoryQuery.data}
              isPending={transactionHistoryQuery.isPending}
              isFetching={transactionHistoryQuery.isFetching}
              error={transactionHistoryQuery.error}
              onRetry={() => void transactionHistoryQuery.refetch()}
              onPageChange={setHistoryPage}
            />
          </>
        )}
      </div>
      {billingSummary.data && (
        <ProCheckoutDialog
          open={isProCheckoutOpen}
          summary={billingSummary.data}
          workspace={workspace}
          returnFocus={subscribeTriggerRef.current}
          onClose={closeProCheckout}
        />
      )}
      <SpreadsheetMigrationWizard
        open={migrationWizardOpen}
        onClose={() => setMigrationWizardOpen(false)}
        onComplete={() => {
          setMigrationWizardOpen(false);
          void refetch();
          void transactionHistoryQuery.refetch();
        }}
      />
    </AppShell>
  );
}
