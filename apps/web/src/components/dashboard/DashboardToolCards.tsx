import {
  DEFAULT_OFW_EXCHANGE_RATES,
  projectCashflow,
  type CashflowForecastOptions,
  type CashflowForecastResult,
} from "@zoption/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Coins } from "lucide-react";
import { Link } from "react-router-dom";

import { getSubscriptions } from "../../lib/api";
import { currentMonth, monthStart } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./DashboardToolCards.css";

export interface DashboardToolCardsProps {
  workspace: AuthenticatedWorkspace;
  startingBalanceMinor: number;
}

type ToolCardTone = "neutral" | "danger";

// Projected balances are calendar days rather than instants, so they are read in UTC the
// way projectCashflow builds them.
const forecastDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** How many renewals the projection found, in the words the card shows. */
function renewalSummary(renewalCount: number): string {
  if (renewalCount === 0) return "No renewals scheduled";
  if (renewalCount === 1) return "1 renewal in the next 30 days";
  return `${renewalCount} renewals in the next 30 days`;
}

/**
 * A renewal lookup that is still running or has failed projects no bills, so it must not
 * warn: the card would otherwise blame a deficit on renewals it has not seen yet.
 */
function projectionTone(forecast: CashflowForecastResult, renewalsLoaded: boolean): ToolCardTone {
  if (!renewalsLoaded) return "neutral";
  return forecast.hasDeficit ? "danger" : "neutral";
}

/**
 * The dashboard doorways into the two tools the mobile home screen already surfaces: the
 * 30-day cash flow forecast and the remittance calculator. Both cards are single links, so
 * each one reads as a destination rather than as a widget with its own controls.
 */
export function DashboardToolCards({ workspace, startingBalanceMinor }: DashboardToolCardsProps) {
  const subscriptionMonth = currentMonth();
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(subscriptionMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(subscriptionMonth)),
  });

  const subscriptions: CashflowForecastOptions["subscriptions"] = (
    subscriptionsQuery.data?.items ?? []
  )
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
      name: item.name,
      amountMinor: item.amountMinor,
      billingCycle: item.billingCycle,
      nextBillingDate: item.nextBillingDate || item.billingDate || "",
      status: item.status,
      categoryName: item.categoryName,
    }));

  const forecast = projectCashflow({ startingBalanceMinor, subscriptions, horizonDays: 30 });
  const renewalsLoaded = subscriptionsQuery.data !== undefined;
  const renewalsUnavailable = subscriptionsQuery.isError;
  const tone = projectionTone(forecast, renewalsLoaded);
  const renewalCount = forecast.upcomingBillRisks.length;
  const lowestBalanceOn = forecastDateFormatter.format(
    new Date(`${forecast.minBalanceDate}T00:00:00Z`),
  );
  const usdMidMarketRate = DEFAULT_OFW_EXCHANGE_RATES.USD.midMarketRate.toFixed(2);

  return (
    <div className="dashboard-tool-cards">
      <Link className="dashboard-tool-card" data-tone={tone} to="/app/subscriptions?view=forecast">
        <span className="dashboard-tool-card-icon">
          <CalendarClock size={14} aria-hidden="true" />
        </span>
        <h3 className="dashboard-tool-card-title">Cash flow forecast</h3>
        {tone === "danger" && <span className="dashboard-tool-card-status">Deficit risk</span>}
        <ChevronRight className="dashboard-tool-card-chevron" size={16} aria-hidden="true" />
        <strong className="dashboard-tool-card-value">
          {renewalsUnavailable
            ? "Renewals unavailable"
            : formatMoney(forecast.minProjectedBalanceMinor)}
        </strong>
        <p className="dashboard-tool-card-meta">
          {renewalsUnavailable
            ? "Your renewals could not be loaded, so this projection is incomplete."
            : `Lowest on ${lowestBalanceOn} · ${renewalSummary(renewalCount)}`}
        </p>
        <p className="dashboard-tool-card-copy">See how each renewal moves your balance.</p>
      </Link>

      <Link className="dashboard-tool-card" to="/app/plan#remittance-calculator">
        <span className="dashboard-tool-card-icon">
          <Coins size={14} aria-hidden="true" />
        </span>
        <h3 className="dashboard-tool-card-title">Remittance calculator</h3>
        <ChevronRight className="dashboard-tool-card-chevron" size={16} aria-hidden="true" />
        <strong className="dashboard-tool-card-value">1 USD = ₱{usdMidMarketRate}</strong>
        <p className="dashboard-tool-card-copy">
          Compare provider fees and what your recipient actually receives.
        </p>
      </Link>
    </div>
  );
}
