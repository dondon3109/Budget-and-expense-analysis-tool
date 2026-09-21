import type {
  AccountBalanceSummaryItem,
  AccountInput,
  AccountRecord,
  CashflowTrend,
  CashflowTrendView,
  DashboardSummary,
  InterestFrequency,
  TransactionListQuery,
} from "@zoption/shared";
import { interestFrequencies } from "@zoption/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useRootLock } from "../hooks/useRootLock";
import { AdjustBalanceModal } from "../components/account/AdjustBalanceModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Skeleton, SkeletonStatus } from "../components/common/Skeleton";
import { ProCheckoutDialog } from "../components/billing/ProCheckoutDialog";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
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
import {
  createAccount,
  deleteAccount,
  getCashflowTrend,
  getDashboard,
  getTransactions,
  getTransferFeeInsight,
  isBillingEnforcementError,
  updateAccount,
} from "../lib/api";
import {
  currentMonth,
  daysInMonth,
  isMonth,
  localIsoDate,
  monthStart,
  shiftMonth,
} from "../lib/calendar";
import { formatFullMonth, formatMoney, formatMonth } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import {
  optimisticId,
  restoreOptimisticSnapshot,
  updateOptimistically,
  type OptimisticCacheSnapshot,
} from "../lib/optimistic";
import { userWorkspace } from "../lib/workspace";
import "./DashboardPage.css";

export function isDashboardEmpty(
  data: DashboardSummary,
  cashflowTrend?: CashflowTrend,
  transactionCount?: number,
): boolean {
  const hasCashflowActivity = cashflowTrend?.points.some(
    (point) => point.incomeMinor !== 0 || point.expenseMinor !== 0,
  );
  return (
    (transactionCount === undefined || transactionCount === 0) &&
    !hasCashflowActivity &&
    data.metrics.moneyInMinor === 0 &&
    data.metrics.moneyOutMinor === 0 &&
    data.spendingByCategory.length === 0 &&
    data.budgetProgress.length === 0
  );
}

const accountTypes: Array<{ value: AccountInput["type"]; label: string }> = [
  { value: "checking", label: "Bank account" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit card" },
  { value: "other", label: "Other" },
];

const dashboardHistoryPageSize = 8;

type TrendState = "positive" | "negative" | "neutral";

interface AccountOptimisticContext {
  accountSnapshot: OptimisticCacheSnapshot;
  dashboardSnapshot: OptimisticCacheSnapshot;
}

/** Human label for an account type, derived from the list that builds the select options. */
function accountTypeLabel(type: AccountInput["type"]): string {
  return accountTypes.find((option) => option.value === type)?.label ?? type;
}

interface DashboardFormModalProps {
  labelledBy: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape: () => void;
  children: ReactNode;
}

/**
 * Chrome shared by the dashboard's inline form dialogs. It renders through a portal so the
 * inert application root from useRootLock does not also disable the dialog, and it owns the
 * Tab trap, Escape handling, and focus restore that these dialogs used to lack.
 */
function DashboardFormModal({
  labelledBy,
  initialFocusRef,
  onEscape,
  children,
}: DashboardFormModalProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { initialFocusRef, onEscape });

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

function dashboardAccountFromRecord(
  account: AccountRecord,
  current?: AccountBalanceSummaryItem,
): AccountBalanceSummaryItem {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceMinor: current?.balanceMinor ?? account.balanceMinor ?? 0,
    balancesByCurrency: current?.balancesByCurrency ??
      account.balancesByCurrency ?? { PHP: 0, USD: 0 },
    archived: account.archived,
    system: account.system ?? false,
    interest: account.interest,
  };
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : current > 0 ? 100 : -100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
}

function trendState(percentage: number, increaseIsPositive = true): TrendState {
  if (percentage === 0) return "neutral";
  const increased = percentage > 0;
  return increased === increaseIsPositive ? "positive" : "negative";
}

export function DashboardPage() {
  const { user } = useAuth();
  const { hasCompletedInitialDashboardExperience } = useInitialDashboardExperience();
  const reportStartupReadiness = usePrivateAppStartupReadiness();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);
  const editAccountNameRef = useRef<HTMLInputElement>(null);
  const shouldRestoreDashboardFocusRef = useRef(!hasCompletedInitialDashboardExperience);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountInput["type"]>("checking");
  const [editingAccount, setEditingAccount] = useState<AccountBalanceSummaryItem>();
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountInput["type"]>("checking");
  const [interestEnabled, setInterestEnabled] = useState(false);
  const [interestRate, setInterestRate] = useState("");
  const [interestFrequency, setInterestFrequency] = useState<InterestFrequency>("monthly");
  const [interestPayDay, setInterestPayDay] = useState(15);
  const [removingAccount, setRemovingAccount] = useState<AccountBalanceSummaryItem>();
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
    queryKey: queryKeys.transactions(workspace, historyQuery),
    queryFn: () => getTransactions(workspace, historyQuery),
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

  const refreshAccountData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
    ]);
  };
  const dashboardSummaryKey = [...queryKeys.dashboard(workspace), "summary"] as const;

  const updateAccountOptimistically = async (
    updateAccounts: (current: AccountRecord[] | undefined) => AccountRecord[] | undefined,
    updateDashboard: (current: DashboardSummary | undefined) => DashboardSummary | undefined,
  ): Promise<AccountOptimisticContext> => {
    const accountSnapshot = await updateOptimistically<AccountRecord[]>(
      queryClient,
      queryKeys.accounts(workspace),
      updateAccounts,
    );
    const dashboardSnapshot = await updateOptimistically<DashboardSummary>(
      queryClient,
      dashboardSummaryKey,
      updateDashboard,
      false,
    );
    return { accountSnapshot, dashboardSnapshot };
  };

  const restoreAccountContext = (context?: AccountOptimisticContext) => {
    restoreOptimisticSnapshot(queryClient, context?.accountSnapshot);
    restoreOptimisticSnapshot(queryClient, context?.dashboardSnapshot);
  };

  const createAccountMutation = useMutation({
    mutationFn: (input: AccountInput) => createAccount(workspace, input),
    onMutate: async (input) => {
      const id = optimisticId("account");
      const account: AccountRecord = {
        ...input,
        id,
        currency: "PHP",
        balanceMinor: 0,
        balancesByCurrency: { PHP: 0, USD: 0 },
        archived: false,
        system: false,
      };
      const cache = await updateAccountOptimistically(
        (current) => (current ? [...current, account] : current),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: [...current.accountBalances.items, dashboardAccountFromRecord(account)],
                },
              }
            : current,
      );
      setAccountName("");
      setIsAddingAccount(false);
      return { cache, id, input };
    },
    onError: (_error, _input, context) => {
      restoreAccountContext(context?.cache);
      setAccountName(context?.input.name ?? "");
      setAccountType(context?.input.type ?? "checking");
      setIsAddingAccount(true);
    },
    onSuccess: (saved, _input, context) => {
      queryClient.setQueryData<AccountRecord[]>(queryKeys.accounts(workspace), (current) =>
        current?.map((account) => (account.id === context.id ? saved : account)),
      );
      queryClient.setQueriesData<DashboardSummary>({ queryKey: dashboardSummaryKey }, (current) =>
        current?.accountBalances
          ? {
              ...current,
              accountBalances: {
                ...current.accountBalances,
                items: current.accountBalances.items.map((account) =>
                  account.id === context.id ? dashboardAccountFromRecord(saved, account) : account,
                ),
              },
            }
          : current,
      );
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });
  const updateAccountMutation = useMutation({
    mutationFn: (args: {
      id: string;
      name: string;
      type: AccountInput["type"];
      interest?: {
        enabled: boolean;
        annualRateBasisPoints: number;
        frequency: InterestFrequency;
        payDay: number | null;
      };
    }) =>
      updateAccount(workspace, {
        id: args.id,
        input: {
          name: args.name,
          type: args.type,
          ...(args.interest !== undefined && { interest: args.interest }),
        },
      }),
    onMutate: async (args) => {
      const form = editingAccount;
      const cache = await updateAccountOptimistically(
        (current) =>
          current?.map((account) =>
            account.id === args.id
              ? {
                  ...account,
                  name: args.name,
                  type: args.type,
                  ...(args.interest && {
                    interest: {
                      enabled: args.interest.enabled,
                      annualRateBasisPoints: args.interest.enabled
                        ? args.interest.annualRateBasisPoints
                        : null,
                      frequency: args.interest.enabled ? args.interest.frequency : null,
                      payDay: args.interest.enabled ? args.interest.payDay : null,
                    },
                  }),
                }
              : account,
          ),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: current.accountBalances.items.map((account) =>
                    account.id === args.id
                      ? {
                          ...account,
                          name: args.name,
                          type: args.type,
                          ...(args.interest && {
                            interest: {
                              enabled: args.interest.enabled,
                              annualRateBasisPoints: args.interest.enabled
                                ? args.interest.annualRateBasisPoints
                                : null,
                              frequency: args.interest.enabled ? args.interest.frequency : null,
                              payDay: args.interest.enabled ? args.interest.payDay : null,
                            },
                          }),
                        }
                      : account,
                  ),
                },
              }
            : current,
      );
      setEditingAccount(undefined);
      return { cache, form };
    },
    onError: (_error, _args, context) => {
      restoreAccountContext(context?.cache);
      setEditingAccount(context?.form);
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });
  const removeAccountMutation = useMutation({
    mutationFn: (accountId: string) => deleteAccount(workspace, accountId),
    onMutate: async (accountId) => {
      const form = removingAccount;
      const cache = await updateAccountOptimistically(
        (current) => current?.filter((account) => account.id !== accountId),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: current.accountBalances.items.filter(
                    (account) => account.id !== accountId,
                  ),
                },
              }
            : current,
      );
      return { cache, form };
    },
    onSuccess: () => {
      setRemovingAccount(undefined);
    },
    onError: (_error, _id, context) => {
      restoreAccountContext(context?.cache);
      setRemovingAccount(context?.form);
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });
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
  const accountActionError = updateAccountMutation.error ?? removeAccountMutation.error;
  const overallBalanceMinor = accountBalances?.balancesByCurrency.PHP ?? 0;
  const removalBalanceMinor = removingAccount?.balancesByCurrency.PHP ?? 0;
  // A removed account stops being charged, so say which plans that affects before it happens.
  const linkedSubscriptions = removingAccount?.activeSubscriptions ?? [];
  const linkedSubscriptionWarning =
    linkedSubscriptions.length === 1
      ? `The active subscription ${linkedSubscriptions[0]} is paid from this account. It stops being charged once the account is removed, and Zoption emails you until you choose another account for it.`
      : linkedSubscriptions.length > 1
        ? `The active subscriptions ${linkedSubscriptions.join(", ")} are paid from this account. They stop being charged once the account is removed, and Zoption emails you until you choose another account for each.`
        : null;
  const transferFeeInsight = transferFeeInsightQuery.data;
  const transferNoun =
    transferFeeInsight?.totalFeeChargedTransfers === 1 ? "transfer" : "transfers";
  const transferFeeUsdMinor = transferFeeInsight?.feesByCurrency.USD ?? 0;
  const previousMetrics = previousSummaryQuery.data?.metrics;
  const currentNetPhpMinor = metrics.incomeByCurrency.PHP - metrics.expenseByCurrency.PHP;
  const previousNetPhpMinor = previousMetrics
    ? previousMetrics.incomeByCurrency.PHP - previousMetrics.expenseByCurrency.PHP
    : 0;
  const incomeChangePercent = calculatePercentageChange(
    metrics.incomeByCurrency.PHP,
    previousMetrics?.incomeByCurrency.PHP ?? 0,
  );
  const expenseChangePercent = calculatePercentageChange(
    metrics.expenseByCurrency.PHP,
    previousMetrics?.expenseByCurrency.PHP ?? 0,
  );
  const netChangePercent = calculatePercentageChange(currentNetPhpMinor, previousNetPhpMinor);
  const trendComparison = `vs ${formatMonth(previousSummaryMonth)}`;
  const overviewItems: OverviewStatItem[] = [
    {
      label: "Income",
      amounts: [
        { amountMinor: metrics.incomeByCurrency.PHP, currency: "PHP" },
        { amountMinor: metrics.incomeByCurrency.USD, currency: "USD" },
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
        { amountMinor: metrics.expenseByCurrency.PHP, currency: "PHP" },
        { amountMinor: metrics.expenseByCurrency.USD, currency: "USD" },
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
        { amountMinor: transferFeeInsight?.feesByCurrency.PHP ?? 0, currency: "PHP" },
        ...(transferFeeUsdMinor > 0
          ? [{ amountMinor: transferFeeUsdMinor, currency: "USD" as const }]
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
      amounts: [{ amountMinor: metrics.remainingBudgetMinor, currency: "PHP" }],
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

        {accountBalances && (
          <div className="dashboard-balance">
            <section className="dashboard-balance-total" aria-labelledby="dashboard-balance-title">
              <div className="dashboard-balance-heading">
                <span className="dashboard-balance-icon" aria-hidden="true">
                  <WalletCards size={19} />
                </span>
                <div>
                  <p>All accounts</p>
                  <h2 id="dashboard-balance-title">Overall balance</h2>
                </div>
              </div>
              <strong>{formatMoney(accountBalances.balancesByCurrency.PHP, "PHP")}</strong>
              {previousMetrics && (
                <div className="dashboard-balance-trend" data-state={trendState(netChangePercent)}>
                  <span>
                    {netChangePercent > 0 ? "+" : ""}
                    {netChangePercent}%
                  </span>
                  <small>net cash flow {trendComparison}</small>
                </div>
              )}
              <span>Calculated from your recorded transactions</span>
              <p className="dashboard-balance-usd">
                {formatMoney(accountBalances.balancesByCurrency.USD, "USD")} in US dollars
              </p>
            </section>
            <section className="dashboard-account-breakdown" aria-label="Account management">
              <div className="dashboard-account-breakdown-heading">
                <span>Account balances</span>
                <div className="dashboard-account-heading-actions">
                  <button
                    className="dashboard-account-adjust-quick"
                    type="button"
                    onClick={() => activeAccounts[0] && setAdjustingAccount(activeAccounts[0])}
                    disabled={activeAccounts.length === 0}
                    title="Adjust balance to match your real cash or bank amount"
                  >
                    <SlidersHorizontal size={14} aria-hidden="true" /> Adjust balance
                  </button>
                  <button
                    className="dashboard-account-add"
                    type="button"
                    onClick={() => setIsAddingAccount((isAdding) => !isAdding)}
                    aria-expanded={isAddingAccount}
                    aria-controls="add-account-form"
                  >
                    <Plus size={14} aria-hidden="true" />{" "}
                    {isAddingAccount ? "Close" : "Add account"}
                  </button>
                </div>
              </div>
              {isAddingAccount && (
                <form
                  id="add-account-form"
                  className="dashboard-account-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createAccountMutation.mutate({ name: accountName, type: accountType });
                  }}
                >
                  <label>
                    <span>Account name</span>
                    <input
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                      placeholder="e.g. Maya Wallet"
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    <span>Account type</span>
                    <select
                      value={accountType}
                      onChange={(event) =>
                        setAccountType(event.target.value as AccountInput["type"])
                      }
                    >
                      {accountTypes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={createAccountMutation.isPending}
                  >
                    {createAccountMutation.isPending ? "Adding…" : "Add"}
                  </button>
                  <UpgradePrompt error={createAccountMutation.error} />
                  {createAccountMutation.error &&
                    !isBillingEnforcementError(createAccountMutation.error) && (
                      <p className="form-error" role="alert">
                        {createAccountMutation.error.message}
                      </p>
                    )}
                </form>
              )}
              <ul>
                {activeAccounts.map((account) => {
                  const isDefaultBank = account.name === "Bank";
                  const canEdit = !account.system || isDefaultBank;
                  const canRemove = !account.system;
                  return (
                    <li key={account.id} data-primary={account.name === "Cash" || undefined}>
                      <div className="dashboard-account-details">
                        <span className="dashboard-account-name">
                          {account.name}
                          {account.name === "Cash" && <em>Primary</em>}
                        </span>
                        <span className="dashboard-account-meta">
                          {accountTypeLabel(account.type)}
                          {account.system && <em>Permanent</em>}
                        </span>
                      </div>
                      <div className="dashboard-account-value">
                        <span className="dashboard-account-actions">
                          <button
                            type="button"
                            onClick={() => setAdjustingAccount(account)}
                            aria-label={`Adjust balance for ${account.name}`}
                            title={`Adjust balance for ${account.name}`}
                          >
                            <SlidersHorizontal size={14} aria-hidden="true" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                updateAccountMutation.reset();
                                setEditingAccount(account);
                                setEditName(account.name);
                                setEditType(account.type);
                                const interest =
                                  account.type === "savings" ? account.interest : undefined;
                                setInterestEnabled(interest?.enabled ?? false);
                                setInterestRate(
                                  interest?.annualRateBasisPoints != null
                                    ? String(interest.annualRateBasisPoints / 100)
                                    : "",
                                );
                                setInterestFrequency(interest?.frequency ?? "monthly");
                                setInterestPayDay(interest?.payDay ?? 15);
                              }}
                              aria-label={`Edit ${account.name}`}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => {
                                removeAccountMutation.reset();
                                setRemovingAccount(account);
                              }}
                              aria-label={`Remove ${account.name}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                        <span className="dashboard-account-balances">
                          <strong>{formatMoney(account.balancesByCurrency.PHP, "PHP")}</strong>
                          {account.balancesByCurrency.USD !== 0 && (
                            <em>{formatMoney(account.balancesByCurrency.USD, "USD")} USD</em>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {accountBalances.items.some((account) => account.archived) && (
                <details className="dashboard-removed-accounts">
                  <summary>
                    Removed accounts (
                    {accountBalances.items.filter((account) => account.archived).length})
                  </summary>
                  <p>Removed accounts stay read-only so historical transactions remain accurate.</p>
                  <ul>
                    {accountBalances.items
                      .filter((account) => account.archived)
                      .map((account) => (
                        <li key={account.id}>
                          <span>{account.name}</span>
                          <span className="dashboard-account-balances">
                            <strong>{formatMoney(account.balancesByCurrency.PHP, "PHP")}</strong>
                            {account.balancesByCurrency.USD !== 0 && (
                              <em>{formatMoney(account.balancesByCurrency.USD, "USD")} USD</em>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              <UpgradePrompt error={accountActionError} />
              {accountActionError && !isBillingEnforcementError(accountActionError) && (
                <p className="dashboard-account-error" role="alert">
                  <strong>That account change did not go through.</strong>
                  <span>{accountActionError.message}</span>
                </p>
              )}
            </section>
          </div>
        )}

        {editingAccount && (
          <DashboardFormModal
            labelledBy="edit-account-title"
            initialFocusRef={editAccountNameRef}
            onEscape={() => {
              if (!updateAccountMutation.isPending) setEditingAccount(undefined);
            }}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Custom account</p>
                <h2 id="edit-account-title">Edit account</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditingAccount(undefined)}
                disabled={updateAccountMutation.isPending}
                aria-label="Close edit account"
              >
                <X size={19} />
              </button>
            </header>
            <form
              className="transaction-form"
              onSubmit={(event) => {
                event.preventDefault();
                updateAccountMutation.mutate({
                  id: editingAccount.id,
                  name: editName,
                  type: editType,
                  ...(editType === "savings" && isPro
                    ? {
                        interest: {
                          enabled: interestEnabled,
                          annualRateBasisPoints:
                            interestEnabled && Number(interestRate) > 0
                              ? Math.round(Number(interestRate) * 100)
                              : 0,
                          frequency: interestEnabled ? interestFrequency : "monthly",
                          payDay:
                            interestEnabled && interestFrequency !== "daily"
                              ? interestPayDay
                              : null,
                        },
                      }
                    : {}),
                });
              }}
            >
              <fieldset>
                <legend>Details</legend>
                <label>
                  <span>Account name</span>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={80}
                    required
                    ref={editAccountNameRef}
                  />
                </label>
                <label>
                  <span>Account type</span>
                  <select
                    value={editType}
                    onChange={(event) => setEditType(event.target.value as AccountInput["type"])}
                  >
                    {accountTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              {editType === "savings" && (
                <fieldset className="account-interest-fieldset">
                  <legend>Interest</legend>
                  {isPro ? (
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={interestEnabled}
                        onChange={(event) => setInterestEnabled(event.target.checked)}
                      />
                      <span>Earn automatic interest</span>
                    </label>
                  ) : (
                    <p className="account-interest-free-option">
                      Earn automatic interest on this account
                    </p>
                  )}
                  {isPro ? (
                    interestEnabled && (
                      <div className="account-interest-settings">
                        <label>
                          <span>Annual interest rate (%)</span>
                          <input
                            value={interestRate}
                            onChange={(event) => setInterestRate(event.target.value)}
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            inputMode="decimal"
                            placeholder="e.g. 5.00"
                            required
                          />
                        </label>
                        <label>
                          <span>Interest received</span>
                          <select
                            value={interestFrequency}
                            onChange={(event) =>
                              setInterestFrequency(event.target.value as InterestFrequency)
                            }
                          >
                            {interestFrequencies.map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {frequency === "daily"
                                  ? "Daily"
                                  : frequency === "monthly"
                                    ? "Monthly"
                                    : "Yearly"}
                              </option>
                            ))}
                          </select>
                        </label>
                        {interestFrequency !== "daily" && (
                          <label>
                            <span>Pay day</span>
                            <select
                              value={interestPayDay}
                              onChange={(event) => setInterestPayDay(Number(event.target.value))}
                            >
                              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <p className="form-hint">
                          Interest is computed from the account's balance and credited automatically{" "}
                          {interestFrequency === "daily"
                            ? "each day"
                            : `on the ${interestPayDay}${interestPayDay === 1 ? "st" : interestPayDay === 2 ? "nd" : interestPayDay === 3 ? "rd" : "th"}`}
                          .
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="form-hint account-interest-pro-callout">
                      Automatic interest is a Pro feature.{" "}
                      <Link to="/app/settings#plan-and-billing">Upgrade to Zoption Pro</Link> to
                      earn interest on this savings account.
                    </p>
                  )}
                </fieldset>
              )}
              <UpgradePrompt error={updateAccountMutation.error} />
              {updateAccountMutation.error &&
                !isBillingEnforcementError(updateAccountMutation.error) && (
                  <p className="form-error" role="alert">
                    {updateAccountMutation.error.message}
                  </p>
                )}
              <div className="edit-account-adjust-prompt">
                <span>Looking to adjust the current balance?</span>
                <button
                  type="button"
                  className="button secondary compact-action"
                  onClick={() => {
                    const target = editingAccount;
                    setEditingAccount(undefined);
                    setAdjustingAccount(target);
                  }}
                >
                  <SlidersHorizontal size={14} aria-hidden="true" /> Adjust balance
                </button>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditingAccount(undefined)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={updateAccountMutation.isPending}
                >
                  {updateAccountMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </DashboardFormModal>
        )}
        {removingAccount && (
          <ConfirmDialog
            title={`Remove ${removingAccount.name}?`}
            consequence={
              <>
                Removing <strong>{removingAccount.name}</strong> takes it out of your account list,
                so it can no longer be chosen for new transactions. Its{" "}
                {formatMoney(removalBalanceMinor, "PHP")} balance and every transaction recorded
                against it stay in your history as read-only records, and because your overall
                balance is calculated from recorded transactions, the{" "}
                {formatMoney(overallBalanceMinor, "PHP")} total does not change. This cannot be
                undone.
                {linkedSubscriptionWarning ? <> {linkedSubscriptionWarning}</> : null}
              </>
            }
            confirmLabel="Remove account"
            busyLabel="Removing…"
            busy={removeAccountMutation.isPending}
            error={removeAccountMutation.error?.message}
            onConfirm={() => removeAccountMutation.mutate(removingAccount.id)}
            onClose={() => setRemovingAccount(undefined)}
          />
        )}

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
