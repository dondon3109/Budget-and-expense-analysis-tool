import type { DashboardSummary } from "@budget/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  FileUp,
  PiggyBank,
  Plus,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { OverviewStatBar } from "../components/dashboard/OverviewStatBar";
import { MonthlyTrend } from "../components/dashboard/MonthlyTrend";
import { SpendingByCategory } from "../components/dashboard/SpendingByCategory";
import { AppShell } from "../components/layout/AppShell";
import { getDashboard } from "../lib/api";
import { formatMoney, formatPeriod } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

export function isDashboardEmpty(data: DashboardSummary): boolean {
  return (
    data.monthlyTrend.length === 0 &&
    data.spendingByCategory.length === 0 &&
    data.budgetProgress.length === 0
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const { data, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard(workspace),
    queryFn: () => getDashboard(workspace),
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
  const empty = isDashboardEmpty(data);

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Your month, at a glance</h1>
            <p>See what came in, what went out, and what is still available.</p>
          </div>
          <span className="date-button">
            <CalendarDays size={17} aria-hidden="true" />{" "}
            {formatPeriod(data.period.from, data.period.to)}
          </span>
        </header>

        {empty ? (
          <section className="workspace-onboarding" aria-labelledby="workspace-onboarding-title">
            <div className="onboarding-copy">
              <p className="eyebrow">A clean starting point</p>
              <h2 id="workspace-onboarding-title">Build your first monthly picture</h2>
              <p>
                Your workspace starts without fictional transactions or budgets. Import a CSV or add
                a transaction when you are ready, and Clarity will build the overview from your
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
                <strong>Return for clarity</strong>
                Review totals, trends, and recurring costs together.
              </p>
            </div>
          </section>
        ) : (
          <>
            <OverviewStatBar
              items={[
                {
                  label: "Money in",
                  value: formatMoney(metrics.moneyInMinor),
                  detail: "Income received this month",
                  icon: ArrowDownRight,
                  tone: "sage",
                },
                {
                  label: "Money out",
                  value: formatMoney(metrics.moneyOutMinor),
                  detail:
                    metrics.moneyInMinor === 0
                      ? "No income recorded this month"
                      : `${Math.round((metrics.moneyOutMinor / metrics.moneyInMinor) * 100)}% of monthly income`,
                  icon: ArrowUpRight,
                  tone: "amber",
                },
                {
                  label: "Net position",
                  value: formatMoney(metrics.netMinor),
                  detail: "After all recorded spending",
                  icon: WalletCards,
                  tone: "ink",
                },
                {
                  label: "Remaining budget",
                  value: formatMoney(metrics.remainingBudgetMinor),
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
                Money in includes income transactions. Money out includes expenses only; transfers
                are excluded. The remaining budget is your total category plan minus recorded
                expenses for the selected month.
              </p>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
