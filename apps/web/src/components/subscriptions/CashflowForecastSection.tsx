import { useMemo, useState } from "react";
import type { SubscriptionMonthItem } from "@zoption/shared";
import { projectCashflow } from "@zoption/shared";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatMoney } from "../../lib/formatters";
import "./CashflowForecastSection.css";

export interface CashflowAccountOption {
  id: string;
  name: string;
  balanceMinor: number | null;
}

export interface CashflowForecastSectionProps {
  items: SubscriptionMonthItem[];
  accounts?: CashflowAccountOption[];
  totalBalanceMinor?: number;
}

type ForecastHorizon = 30 | 60 | 90;

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

export function CashflowForecastSection({
  items,
  accounts,
  totalBalanceMinor,
}: CashflowForecastSectionProps) {
  const [horizonDays, setHorizonDays] = useState<ForecastHorizon>(30);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [safetyBufferMinor] = useState<number>(0);

  // Compute base starting balance
  const effectiveStartingBalance = useMemo(() => {
    if (selectedAccountId !== "all" && accounts) {
      const found = accounts.find((a) => a.id === selectedAccountId);
      return found?.balanceMinor ?? 0;
    }
    if (totalBalanceMinor !== undefined) {
      return totalBalanceMinor;
    }
    if (accounts && accounts.length > 0) {
      return accounts.reduce((acc, a) => acc + (a.balanceMinor ?? 0), 0);
    }
    return 0;
  }, [selectedAccountId, accounts, totalBalanceMinor]);

  // Filter subscriptions if a specific account is selected
  const activeSubscriptions = useMemo(() => {
    return items
      .filter((item) => item.status === "active")
      .filter((item) => {
        if (selectedAccountId === "all") return true;
        return item.accountId === selectedAccountId;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        amountMinor: item.amountMinor,
        billingCycle: item.billingCycle,
        nextBillingDate: item.nextBillingDate || item.billingDate || "",
        status: item.status,
        categoryName: item.categoryName,
      }));
  }, [items, selectedAccountId]);

  // Run the projection
  const forecast = useMemo(() => {
    return projectCashflow({
      startingBalanceMinor: effectiveStartingBalance,
      subscriptions: activeSubscriptions,
      horizonDays,
      safetyBufferMinor,
    });
  }, [effectiveStartingBalance, activeSubscriptions, horizonDays, safetyBufferMinor]);

  // Determine overall status banner type
  const alertStatus = useMemo(() => {
    if (forecast.hasDeficit || forecast.minProjectedBalanceMinor < 0) {
      return "deficit";
    }
    if (
      forecast.hasBufferDip ||
      (safetyBufferMinor > 0 && forecast.minProjectedBalanceMinor < safetyBufferMinor)
    ) {
      return "low_buffer";
    }
    return "safe";
  }, [forecast, safetyBufferMinor]);

  // Max and min balances for the timeline visualization scale
  const { minVal, range } = useMemo(() => {
    const vals = forecast.dailyTimeline.map((d) => d.projectedBalanceMinor);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1000);
    const r = Math.max(max - min, 1);
    return { minVal: min, range: r };
  }, [forecast]);

  return (
    <section className="cashflow-forecast-section" aria-label="Cashflow Forecast">
      {/* Header with Controls */}
      <div className="forecast-header">
        <div className="forecast-title-group">
          <div className="forecast-badge">
            <CalendarClock size={16} aria-hidden="true" />
            <span>Cashflow Projection</span>
          </div>
          <h2 className="forecast-heading">Upcoming Balance & Obligation Forecast</h2>
          <p className="forecast-subheading">
            Simulate your expected cash position based on current liquid balances and recurring subscription commitments.
          </p>
        </div>

        <div className="forecast-controls">
          {accounts && accounts.length > 1 && (
            <div className="forecast-control-group">
              <label htmlFor="account-filter-select" className="forecast-control-label">
                Account
              </label>
              <select
                id="account-filter-select"
                className="forecast-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="all">All Liquid Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatMoney(acc.balanceMinor ?? 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="forecast-control-group">
            <span className="forecast-control-label">Horizon</span>
            <div className="forecast-horizon-toggle" role="group" aria-label="Forecast horizon">
              {([30, 60, 90] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`horizon-btn ${horizonDays === days ? "active" : ""}`}
                  onClick={() => setHorizonDays(days)}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Alert Banner */}
      {alertStatus === "deficit" && (
        <div className="forecast-alert-banner alert-deficit" role="alert">
          <div className="alert-icon-wrap">
            <ShieldAlert size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Deficit Risk Detected</strong>
            <p className="alert-desc">
              Your balance is projected to fall below zero on{" "}
              <strong>{formatFullDate(forecast.minBalanceDate)}</strong>, reaching a minimum of{" "}
              <span className="alert-amount negative">
                {formatMoney(forecast.minProjectedBalanceMinor)}
              </span>
              . Consider adjusting renewal dates or transferring additional funds to prevent overdraft.
            </p>
          </div>
        </div>
      )}

      {alertStatus === "low_buffer" && (
        <div className="forecast-alert-banner alert-warning" role="alert">
          <div className="alert-icon-wrap">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Low Buffer Warning</strong>
            <p className="alert-desc">
              Your balance drops close to your reserve threshold around{" "}
              <strong>{formatFullDate(forecast.minBalanceDate)}</strong> ({formatMoney(
                forecast.minProjectedBalanceMinor,
              )}
              ). Keep an eye on incoming payments to maintain comfortable liquidity.
            </p>
          </div>
        </div>
      )}

      {alertStatus === "safe" && (
        <div className="forecast-alert-banner alert-safe" role="status">
          <div className="alert-icon-wrap">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Healthy Cashflow Projection</strong>
            <p className="alert-desc">
              All upcoming bill obligations are safely covered across the next {horizonDays} days with a
              lowest projected buffer of {formatMoney(forecast.minProjectedBalanceMinor)} on{" "}
              {formatDisplayDate(forecast.minBalanceDate)}.
            </p>
          </div>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="forecast-metrics-grid">
        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Starting Balance</span>
            <div className="metric-icon-box">
              <Wallet size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="metric-value">{formatMoney(forecast.startingBalanceMinor)}</div>
          <div className="metric-caption">As of {formatDisplayDate(forecast.startDate)}</div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Projected End Balance</span>
            <div className="metric-icon-box">
              {forecast.endingBalanceMinor >= forecast.startingBalanceMinor ? (
                <TrendingUp size={16} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} aria-hidden="true" />
              )}
            </div>
          </div>
          <div
            className={`metric-value ${forecast.endingBalanceMinor < 0 ? "negative" : ""}`}
          >
            {formatMoney(forecast.endingBalanceMinor)}
          </div>
          <div className="metric-caption">At day {horizonDays} ({formatDisplayDate(forecast.endDate)})</div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Lowest Projected Point</span>
            <div className={`metric-icon-box ${forecast.minProjectedBalanceMinor < 0 ? "danger" : ""}`}>
              <AlertCircle size={16} aria-hidden="true" />
            </div>
          </div>
          <div
            className={`metric-value ${forecast.minProjectedBalanceMinor < 0 ? "negative" : ""}`}
          >
            {formatMoney(forecast.minProjectedBalanceMinor)}
          </div>
          <div className="metric-caption">Expected on {formatDisplayDate(forecast.minBalanceDate)}</div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Upcoming Bill Outflows</span>
            <div className="metric-icon-box">
              <DollarSign size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="metric-value">{formatMoney(forecast.totalBillsMinor)}</div>
          <div className="metric-caption">
            {forecast.upcomingBillRisks.length} renewal{forecast.upcomingBillRisks.length === 1 ? "" : "s"} over {horizonDays}d
          </div>
        </div>
      </div>

      {/* Visual Projection Summary */}
      <div className="forecast-projection-card">
        <div className="projection-card-header">
          <div>
            <h3 className="projection-card-title">Projected Balance Trajectory</h3>
            <p className="projection-card-subtitle">
              Daily simulation over the next {horizonDays} days highlighting bill deductions and minimum liquidity.
            </p>
          </div>
          <div className="projection-legend">
            <span className="legend-item">
              <span className="legend-dot normal" />
              Normal
            </span>
            <span className="legend-item">
              <span className="legend-dot dip" />
              Low / Dip
            </span>
            <span className="legend-item">
              <span className="legend-dot deficit" />
              Deficit
            </span>
          </div>
        </div>

        <div className="projection-chart-container">
          <div className="projection-timeline-bars" role="img" aria-label="Cashflow projection timeline">
            {forecast.dailyTimeline.map((day) => {
              const heightPercent = Math.max(
                10,
                Math.min(100, ((day.projectedBalanceMinor - minVal) / range) * 100),
              );
              const statusClass = day.isDeficit
                ? "bar-deficit"
                : day.isDip
                ? "bar-dip"
                : "bar-safe";

              const hasBills = day.events.some((e) => e.type === "bill");

              return (
                <div
                  key={day.date}
                  className={`timeline-bar-col ${statusClass}`}
                  title={`${formatDisplayDate(day.date)}: ${formatMoney(day.projectedBalanceMinor)}${
                    hasBills ? ` · Bills: ${day.events.filter((e) => e.type === "bill").map((b) => b.name).join(", ")}` : ""
                  }`}
                >
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  {hasBills && <span className="bar-bill-marker" aria-hidden="true" />}
                  {(day.dayIndex === 0 ||
                    day.dayIndex === Math.floor(horizonDays / 2) ||
                    day.dayIndex === horizonDays - 1 ||
                    day.date === forecast.minBalanceDate) && (
                    <span className="bar-label">
                      {formatDisplayDate(day.date)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="projection-summary-footer">
            <div className="summary-stat">
              <span className="summary-stat-label">Start</span>
              <strong className="summary-stat-value">{formatMoney(forecast.startingBalanceMinor)}</strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Net Movement</span>
              <strong
                className={`summary-stat-value ${
                  forecast.netChangeMinor < 0 ? "negative" : "positive"
                }`}
              >
                {forecast.netChangeMinor < 0 ? "−" : "+"}
                {formatMoney(Math.abs(forecast.netChangeMinor))}
              </strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Lowest Balance</span>
              <strong
                className={`summary-stat-value ${
                  forecast.minProjectedBalanceMinor < 0 ? "negative" : ""
                }`}
              >
                {formatMoney(forecast.minProjectedBalanceMinor)}
              </strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Horizon End</span>
              <strong
                className={`summary-stat-value ${
                  forecast.endingBalanceMinor < 0 ? "negative" : ""
                }`}
              >
                {formatMoney(forecast.endingBalanceMinor)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Bill Obligations with Risk Badges */}
      <div className="forecast-obligations-card">
        <div className="obligations-card-header">
          <div className="obligations-header-title">
            <Clock size={18} aria-hidden="true" />
            <h3 className="projection-card-title">Upcoming Bill Obligations</h3>
          </div>
          <span className="obligations-count-badge">
            {forecast.upcomingBillRisks.length} Scheduled Payment{forecast.upcomingBillRisks.length === 1 ? "" : "s"}
          </span>
        </div>

        {forecast.upcomingBillRisks.length === 0 ? (
          <div className="forecast-empty-state">
            <CheckCircle2 size={32} className="empty-icon" aria-hidden="true" />
            <p className="empty-title">No upcoming bills in this period</p>
            <p className="empty-desc">
              There are no active subscription renewals scheduled within the next {horizonDays} days.
            </p>
          </div>
        ) : (
          <div className="obligations-table-wrapper">
            <table className="obligations-table">
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th>Subscription / Obligation</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance After</th>
                  <th className="text-center">Risk Assessment</th>
                </tr>
              </thead>
              <tbody>
                {forecast.upcomingBillRisks.map((risk, index) => {
                  let badgeClass = "badge-safe";
                  let badgeText = "Safe";
                  if (risk.riskLevel === "critical_deficit") {
                    badgeClass = "badge-deficit";
                    badgeText = "Deficit risk";
                  } else if (risk.riskLevel === "low_buffer") {
                    badgeClass = "badge-warning";
                    badgeText = "Low buffer";
                  }

                  return (
                    <tr key={`${risk.billId}-${risk.dueDate}-${index}`}>
                      <td className="due-cell">
                        <span className="due-date-text">{formatDisplayDate(risk.dueDate)}</span>
                        <span className="due-days-sub">
                          {risk.daysUntilDue === 0
                            ? "Today"
                            : risk.daysUntilDue === 1
                            ? "Tomorrow"
                            : `in ${risk.daysUntilDue} days`}
                        </span>
                      </td>
                      <td className="name-cell">
                        <strong className="obligation-name">{risk.billName}</strong>
                      </td>
                      <td className="amount-cell text-right">
                        <span className="bill-amount">−{formatMoney(risk.amountMinor)}</span>
                      </td>
                      <td className="balance-cell text-right">
                        <span
                          className={`balance-after ${
                            risk.projectedBalanceAfterMinor < 0 ? "negative" : ""
                          }`}
                        >
                          {formatMoney(risk.projectedBalanceAfterMinor)}
                        </span>
                      </td>
                      <td className="risk-cell text-center">
                        <span className={`risk-badge ${badgeClass}`}>{badgeText}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
