import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Info,
  PiggyBank,
  WalletCards,
} from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { MetricCard } from "../components/dashboard/MetricCard";
import { InsightsPanel } from "../components/dashboard/InsightsPanel";
import { MonthlyTrend } from "../components/dashboard/MonthlyTrend";
import { SpendingByCategory } from "../components/dashboard/SpendingByCategory";
import { AppShell } from "../components/layout/AppShell";
import { getDashboard } from "../lib/api";
import { formatMoney, formatPeriod } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { demoWorkspace, userWorkspace, type WorkspaceMode } from "../lib/workspace";

export function DashboardPage({ mode }: { mode: WorkspaceMode }) {
  const { user } = useAuth();
  const workspace = mode === "demo" ? demoWorkspace : userWorkspace(user!);
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard(workspace),
    queryFn: () => getDashboard(workspace),
  });

  if (isError) {
    return (
      <AppShell mode={mode}>
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
  return (
    <AppShell mode={mode}>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Your month, at a glance</h1>
            <p>See what came in, what went out, and what is still available.</p>
          </div>
          <span className="date-button">
            <CalendarDays size={17} /> {formatPeriod(data.period.from, data.period.to)}
          </span>
        </header>
        {mode === "demo" && (
          <div className="demo-notice">
            <Info size={17} />
            <p>
              <strong>You’re viewing sample data.</strong> This overview is read-only and contains no
              real financial information.
            </p>
            <span>{isFetching ? "Refreshing…" : "Up to date"}</span>
          </div>
        )}
        <section className="metric-grid" aria-label="Monthly summary">
          <MetricCard
            label="Money in"
            value={formatMoney(metrics.moneyInMinor)}
            detail="Income received this month"
            icon={ArrowDownRight}
            tone="sage"
          />
          <MetricCard
            label="Money out"
            value={formatMoney(metrics.moneyOutMinor)}
            detail={
              metrics.moneyInMinor === 0
                ? "No income recorded this month"
                : `${Math.round((metrics.moneyOutMinor / metrics.moneyInMinor) * 100)}% of monthly income`
            }
            icon={ArrowUpRight}
            tone="amber"
          />
          <MetricCard
            label="Net position"
            value={formatMoney(metrics.netMinor)}
            detail="After all recorded spending"
            icon={WalletCards}
            tone="ink"
          />
          <MetricCard
            label="Remaining budget"
            value={formatMoney(metrics.remainingBudgetMinor)}
            detail={`${metrics.budgetUsedPercent}% of plan used`}
            icon={PiggyBank}
            tone="plum"
          />
        </section>
        <div className="dashboard-grid">
          <SpendingByCategory data={data.spendingByCategory} mode={mode} />
          <MonthlyTrend data={data.monthlyTrend} />
          <InsightsPanel data={data.insights} />
          <BudgetProgress data={data.budgetProgress} mode={mode} />
        </div>
        <details className="calculation-note">
          <summary>How these numbers are calculated</summary>
          <p>
            Money in includes income transactions. Money out includes expenses only; transfers are
            excluded. The remaining budget is your total category plan minus recorded expenses for
            the selected month.
          </p>
        </details>
      </div>
    </AppShell>
  );
}
