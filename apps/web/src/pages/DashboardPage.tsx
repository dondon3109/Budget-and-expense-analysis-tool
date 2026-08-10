import type {
  AccountBalanceSummaryItem,
  AccountInput,
  AccountInterestUpdate,
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
  FileUp,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { ProCheckoutDialog } from "../components/billing/ProCheckoutDialog";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { DashboardTransactionHistory } from "../components/dashboard/DashboardTransactionHistory";
import { GoalsSubscriptionPanel } from "../components/dashboard/GoalsSubscriptionPanel";
import { OverviewStatBar, type OverviewStatItem } from "../components/dashboard/OverviewStatBar";
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
  updateAccountInterest,
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
  const [cashflowView, setCashflowView] = useState<CashflowTrendView>("weekly");
  const [historyPage, setHistoryPage] = useState(1);
  const [isProCheckoutOpen, setIsProCheckoutOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const subscribeTriggerRef = useRef<HTMLElement | null>(null);
  const handledPostAuthCheckoutIntentRef = useRef(false);
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
  const createAccountMutation = useMutation({
    mutationFn: (input: AccountInput) => createAccount(workspace, input),
    onSuccess: async () => {
      setAccountName("");
      setIsAddingAccount(false);
      await refreshAccountData();
    },
  });
  const renameAccountMutation = useMutation({
    mutationFn: (args: { id: string; name: string; type: AccountInput["type"] }) =>
      updateAccount(workspace, { id: args.id, input: { name: args.name, type: args.type } }),
    onSuccess: async () => {
      setEditingAccount(undefined);
      await refreshAccountData();
    },
  });
  const removeAccountMutation = useMutation({
    mutationFn: (accountId: string) => deleteAccount(workspace, accountId),
    onSuccess: async () => {
      setRemovingAccount(undefined);
      await refreshAccountData();
    },
  });
  const updateInterestMutation = useMutation({
    mutationFn: (args: { id: string; input: AccountInterestUpdate }) =>
      updateAccountInterest(workspace, args),
    onSuccess: async () => {
      setEditingAccount(undefined);
      await refreshAccountData();
    },
  });

  if (isError) {
    return (
      <AppShell>
        <div className="full-page-status error-state">
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
        <div className="dashboard-refetch-skeleton" role="status" aria-live="polite">
          <span className="sr-only">Refreshing your dashboard</span>
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
  const accountActionError = renameAccountMutation.error ?? removeAccountMutation.error;
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
            <Link className="button primary" to="/app/transactions?add=1">
              <Plus size={17} aria-hidden="true" /> Add transaction
            </Link>
          </div>
        </header>

        {accountBalances && (
          <section className="dashboard-balance" aria-labelledby="dashboard-balance-title">
            <div className="dashboard-balance-total">
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
            </div>
            <section className="dashboard-account-breakdown" aria-label="Account management">
              <div className="dashboard-account-breakdown-heading">
                <span>Account balances</span>
                <button
                  className="dashboard-account-add"
                  type="button"
                  onClick={() => setIsAddingAccount((isAdding) => !isAdding)}
                  aria-expanded={isAddingAccount}
                  aria-controls="add-account-form"
                >
                  <Plus size={14} aria-hidden="true" /> {isAddingAccount ? "Close" : "Add account"}
                </button>
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
                          {account.type}
                          {account.system && <em>Permanent</em>}
                        </span>
                      </div>
                      <div className="dashboard-account-value">
                        {canEdit && (
                          <span className="dashboard-account-actions">
                            <button
                              type="button"
                              onClick={() => {
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
                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => setRemovingAccount(account)}
                                aria-label={`Remove ${account.name}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        )}
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
                  {accountActionError.message}
                </p>
              )}
            </section>
          </section>
        )}

        {editingAccount && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-account-title"
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
                  disabled={renameAccountMutation.isPending || updateInterestMutation.isPending}
                  aria-label="Close edit account"
                >
                  <X size={19} />
                </button>
              </header>
              <form
                className="transaction-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  renameAccountMutation.mutate({
                    id: editingAccount.id,
                    name: editName,
                    type: editType,
                  });
                  if (editType === "savings" && isPro) {
                    updateInterestMutation.mutate({
                      id: editingAccount.id,
                      input: {
                        enabled: interestEnabled,
                        annualRateBasisPoints:
                          interestEnabled && Number(interestRate) > 0
                            ? Math.round(Number(interestRate) * 100)
                            : 0,
                        frequency: interestEnabled ? interestFrequency : "monthly",
                        payDay:
                          interestEnabled && interestFrequency !== "daily" ? interestPayDay : null,
                      },
                    });
                  }
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
                      autoFocus
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
                            Interest is computed from the account's balance and credited
                            automatically{" "}
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
                    disabled={renameAccountMutation.isPending || updateInterestMutation.isPending}
                  >
                    {renameAccountMutation.isPending || updateInterestMutation.isPending
                      ? "Saving…"
                      : "Save"}
                  </button>
                </div>
                {updateInterestMutation.error && (
                  <p className="form-error" role="alert">
                    {updateInterestMutation.error.message}
                  </p>
                )}
              </form>
            </section>
          </div>
        )}
        {removingAccount && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-account-title"
            >
              <header className="modal-header">
                <div>
                  <p className="eyebrow">Remove custom account</p>
                  <h2 id="remove-account-title">Remove {removingAccount.name}?</h2>
                </div>
              </header>
              <p>
                It will no longer appear when adding new transactions. Your existing transactions
                and its calculated balance will remain in your history.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setRemovingAccount(undefined)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => removeAccountMutation.mutate(removingAccount.id)}
                  disabled={removeAccountMutation.isPending}
                >
                  {removeAccountMutation.isPending ? "Removing…" : "Remove account"}
                </button>
              </div>
            </section>
          </div>
        )}

        {empty ? (
          <section className="workspace-onboarding" aria-labelledby="workspace-onboarding-title">
            <div className="onboarding-copy">
              <p className="eyebrow">A clean starting point</p>
              <h2 id="workspace-onboarding-title">Build your first monthly picture</h2>
              <p>
                Your workspace starts without fictional transactions or budgets. Import a CSV or add
                a transaction when you are ready, and Zoption will build the overview from your
                data.
              </p>
              <div className="onboarding-actions">
                <Link className="button primary" to="/app/import">
                  <FileUp size={17} aria-hidden="true" /> Import a CSV
                </Link>
                <Link className="button secondary" to="/app/transactions">
                  <Plus size={17} aria-hidden="true" /> Add a transaction
                </Link>
              </div>
            </div>
            <div className="onboarding-steps" aria-label="Getting started">
              <span>1</span>
              <p>
                <strong>Add your records</strong>
                Import a file or enter transactions manually.
              </p>
              <span>2</span>
              <p>
                <strong>Shape a budget</strong>
                Set practical monthly limits by category.
              </p>
              <span>3</span>
              <p>
                <strong>Return for a clearer picture</strong>
                Review totals, trends, and recurring costs together.
              </p>
            </div>
          </section>
        ) : (
          <>
            <OverviewStatBar items={overviewItems} />
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
                Remaining budget is that month’s category plan minus its recorded expenses and does
                not carry over.
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
    </AppShell>
  );
}
