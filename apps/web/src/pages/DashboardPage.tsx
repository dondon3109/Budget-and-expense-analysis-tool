import type { AccountBalanceSummaryItem, AccountInput, DashboardSummary } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  FileUp,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { OverviewStatBar } from "../components/dashboard/OverviewStatBar";
import { MonthlyTrend } from "../components/dashboard/MonthlyTrend";
import { SpendingByCategory } from "../components/dashboard/SpendingByCategory";
import { AppShell } from "../components/layout/AppShell";
import { createAccount, deleteAccount, getDashboard, updateAccount } from "../lib/api";
import { formatPeriod } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

export function isDashboardEmpty(data: DashboardSummary): boolean {
  return (
    data.monthlyTrend.length === 0 &&
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

export function DashboardPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountInput["type"]>("checking");
  const [editingAccount, setEditingAccount] = useState<AccountBalanceSummaryItem>();
  const [editName, setEditName] = useState("");
  const [removingAccount, setRemovingAccount] = useState<AccountBalanceSummaryItem>();
  const { data, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard(workspace),
    queryFn: () => getDashboard(workspace),
  });
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
  if (!data) return <div className="full-page-status">Preparing your dashboard…</div>;

  const { metrics } = data;
  const accountBalances = data.accountBalances;
  const activeAccounts = [...(accountBalances?.items ?? [])]
    .filter((account) => !account.archived)
    .sort((left, right) => {
      if (left.name === "Cash") return -1;
      if (right.name === "Cash") return 1;
      return left.name.localeCompare(right.name);
    });
  const formatCurrency = (amountMinor: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
      amountMinor / 100,
    );
  const empty = isDashboardEmpty(data);

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Profile Overview</p>
            <h1>Your month, at a glance</h1>
            <p>See what came in, what went out, and what is still available.</p>
          </div>
          <span className="date-button">
            <CalendarDays size={17} aria-hidden="true" />{" "}
            {formatPeriod(data.period.from, data.period.to)}
          </span>
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
              <strong>{formatCurrency(accountBalances.overallBalanceMinor)}</strong>
              <span>Calculated from your recorded transactions</span>
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
                  {createAccountMutation.error && (
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
                      <strong>{formatCurrency(account.balanceMinor)}</strong>
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
                          <strong>{formatCurrency(account.balanceMinor)}</strong>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              {(renameAccountMutation.error || removeAccountMutation.error) && (
                <p className="dashboard-account-error" role="alert">
                  {renameAccountMutation.error?.message ?? removeAccountMutation.error?.message}
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
                  amountMinor: metrics.moneyInMinor,
                  detail: "Income received this month",
                  icon: ArrowDownRight,
                  tone: "income",
                },
                {
                  label: "Expenses",
                  amountMinor: metrics.moneyOutMinor,
                  detail:
                    metrics.moneyInMinor === 0
                      ? "No income recorded this month"
                      : `${Math.round((metrics.moneyOutMinor / metrics.moneyInMinor) * 100)}% of monthly income`,
                  icon: ArrowUpRight,
                  tone: "expense",
                },
                {
                  label: "Remaining budget",
                  amountMinor: metrics.remainingBudgetMinor,
                  detail: `${metrics.budgetUsedPercent}% of plan used`,
                  icon: PiggyBank,
                  tone: "plum",
                },
              ]}
            />
            <div className="dashboard-grid">
              <SpendingByCategory data={data.spendingByCategory} />
              <MonthlyTrend data={data.monthlyTrend} />
              <InsightsPanel data={data.insights} />
              <BudgetProgress data={data.budgetProgress} />
            </div>
            <details className="calculation-note">
              <summary>How these numbers are calculated</summary>
              <p>
                Income includes income transactions. Expenses include expense transactions only;
                transfers move money between accounts and do not change your overall balance. The
                remaining budget is your total category plan minus recorded expenses for the
                selected month.
              </p>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
