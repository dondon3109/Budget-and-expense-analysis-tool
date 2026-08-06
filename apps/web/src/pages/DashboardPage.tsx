import type {
  AccountBalanceSummaryItem,
  AccountInput,
  CashflowTrend,
  CashflowTrendView,
  DashboardSummary,
  TransactionListQuery,
} from "@zoption/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileUp,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { ProCheckoutDialog } from "../components/billing/ProCheckoutDialog";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import {
  DashboardStartupExperience,
  type DashboardStartupPhase,
} from "../components/dashboard/DashboardStartupExperience";
import { DashboardTransactionHistory } from "../components/dashboard/DashboardTransactionHistory";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { OverviewStatBar } from "../components/dashboard/OverviewStatBar";
import { useInitialDashboardExperience } from "../components/dashboard/InitialDashboardExperienceProvider";
import { MonthlyTrend } from "../components/dashboard/MonthlyTrend";
import { SpendingByCategory } from "../components/dashboard/SpendingByCategory";
import { TransferFeeInsightCard } from "../components/dashboard/TransferFeeInsightCard";
import { MonthSelector } from "../components/month/MonthSelector";
import { AppShell } from "../components/layout/AppShell";
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
import { currentMonth, daysInMonth, isMonth, localIsoDate, monthStart } from "../lib/calendar";
import { formatFullMonth, formatMoney } from "../lib/formatters";
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

export function DashboardPage() {
  const { user } = useAuth();
  const {
    hasCompletedInitialDashboardExperience,
    completeInitialDashboardExperience,
  } = useInitialDashboardExperience();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [startupPhase, setStartupPhase] = useState<DashboardStartupPhase>(() =>
    hasCompletedInitialDashboardExperience ? "hidden" : "intro",
  );
  const [dashboardEntranceState, setDashboardEntranceState] = useState<
    "waiting" | "revealing" | "ready"
  >(() => (hasCompletedInitialDashboardExperience ? "ready" : "waiting"));
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldRestoreDashboardFocusRef = useRef(!hasCompletedInitialDashboardExperience);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountInput["type"]>("checking");
  const [editingAccount, setEditingAccount] = useState<AccountBalanceSummaryItem>();
  const [editName, setEditName] = useState("");
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
  const hasPostAuthCheckoutIntent = searchParams.get("proCheckout") === "open";
  const isAppReady = data !== undefined;
  const isAppSettled = isAppReady || isError;
  const handleStartupPhaseChange = useCallback((phase: DashboardStartupPhase) => {
    setStartupPhase(phase);
    if (phase === "complete") setDashboardEntranceState("revealing");
  }, []);

  useEffect(() => {
    if (startupPhase !== "hidden" || !shouldRestoreDashboardFocusRef.current) return undefined;

    shouldRestoreDashboardFocusRef.current = false;
    const focusFrame = window.requestAnimationFrame(() => {
      const activeDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!activeDialog) dashboardHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [startupPhase]);

  useEffect(() => {
    if (!hasPostAuthCheckoutIntent) {
      handledPostAuthCheckoutIntentRef.current = false;
      return;
    }
    if (
      startupPhase !== "hidden" ||
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
    hasPostAuthCheckoutIntent,
    isProCheckoutOpen,
    setSearchParams,
    startupPhase,
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
    mutationFn: (args: { id: string; name: string }) =>
      updateAccount(workspace, { id: args.id, input: { name: args.name } }),
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

  const startupExperience = (
    <DashboardStartupExperience
      isAppReady={isAppReady}
      isAppSettled={isAppSettled}
      hasCompleted={hasCompletedInitialDashboardExperience}
      onComplete={completeInitialDashboardExperience}
      onPhaseChange={handleStartupPhaseChange}
    />
  );

  if (isError) {
    return (
      <>
        {startupExperience}
        <div className="dashboard-entrance" data-entrance-state={dashboardEntranceState}>
          <AppShell>
            <div className="full-page-status error-state">
              <strong>The dashboard could not be loaded.</strong>
              <span>{error.message}</span>
              <button className="button primary" type="button" onClick={() => void refetch()}>
                Try again
              </button>
            </div>
          </AppShell>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        {startupExperience}
        {hasCompletedInitialDashboardExperience && (
          <AppShell>
            <div className="dashboard-refetch-skeleton" role="status" aria-live="polite">
              <span className="sr-only">Refreshing your dashboard</span>
            </div>
          </AppShell>
        )}
      </>
    );
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

  return (
    <>
      {startupExperience}
      <div className="dashboard-entrance" data-entrance-state={dashboardEntranceState}>
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
                {activeAccounts.map((account) => (
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
                      {!account.system && (
                        <span className="dashboard-account-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccount(account);
                              setEditName(account.name);
                            }}
                            aria-label={`Rename ${account.name}`}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemovingAccount(account)}
                            aria-label={`Remove ${account.name}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
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
                ))}
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
              aria-labelledby="rename-account-title"
            >
              <header className="modal-header">
                <div>
                  <p className="eyebrow">Custom account</p>
                  <h2 id="rename-account-title">Rename account</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setEditingAccount(undefined)}
                  disabled={renameAccountMutation.isPending}
                  aria-label="Close rename account"
                >
                  <X size={19} />
                </button>
              </header>
              <form
                className="transaction-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  renameAccountMutation.mutate({ id: editingAccount.id, name: editName });
                }}
              >
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
                    disabled={renameAccountMutation.isPending}
                  >
                    {renameAccountMutation.isPending ? "Saving…" : "Save name"}
                  </button>
                </div>
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
            <OverviewStatBar
              items={[
                {
                  label: "Income",
                  amounts: [
                    { amountMinor: metrics.incomeByCurrency.PHP, currency: "PHP" },
                    { amountMinor: metrics.incomeByCurrency.USD, currency: "USD" },
                  ],
                  detail: `Income received in ${selectedMonthLabel}`,
                  icon: ArrowDownRight,
                  tone: "income",
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
                },
                {
                  label: "Remaining budget",
                  amounts: [{ amountMinor: metrics.remainingBudgetMinor, currency: "PHP" }],
                  detail: `${metrics.budgetUsedPercent}% of plan used`,
                  icon: PiggyBank,
                  tone: "plum",
                },
              ]}
            />
            <TransferFeeInsightCard insight={transferFeeInsightQuery.data} />
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
              <InsightsPanel data={data.insights} monthLabel={selectedMonthLabel} />
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
                Income left after expenses is income minus expenses for {selectedMonthLabel}. Remaining
                budget is that month’s category plan minus its recorded expenses and does not carry over.
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
      </div>
    </>
  );
}
