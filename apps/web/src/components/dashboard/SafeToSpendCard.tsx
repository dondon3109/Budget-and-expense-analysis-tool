import {
  getDaysLeftInWeek,
  hasSpendingBasis,
  overspendingAlert,
  overspendingAlertMessage,
  projectCashflow,
  safeToSpend,
  forecastSubscriptions,
} from "@zoption/shared";
import { AlertTriangle, CalendarClock, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { currentMonth, monthStart } from "../../lib/calendar";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { workspaceCurrency } from "../../lib/workspaceCurrency";
import { useSubscriptions } from "../../queries/subscriptions";
import { OverviewStatValue } from "./OverviewStatBar";
import "./SafeToSpendCard.css";

export interface SafeToSpendCardProps {
  workspace: AuthenticatedWorkspace;
  startingBalanceMinor: number;
  remainingBudgetMinor?: number;
}

/**
 * A caveat only: the line follows the renewal lookup as well as the amount, so a lookup that
 * is still running or has failed is never described as a week with no bills in it. A settled
 * figure needs no caption, and an exhausted one is explained by the alert.
 */
function guidanceText(
  renewalLookup: "pending" | "error" | "ready",
  hasBasis: boolean,
): string | null {
  if (renewalLookup === "pending") return "Checking your bills, so this figure may still fall.";
  if (renewalLookup === "error") {
    return "Bills could not be loaded, so this figure may be optimistic.";
  }
  if (!hasBasis) return "Add your balance or a first transaction to see what's safe to spend.";
  return null;
}

/**
 * The overview stat-bar cell for what is safe to spend this week: the remaining weekly envelope paced
 * across the days left in the week, capped by a 30-day projection of the active
 * subscription renewals.
 */
export function SafeToSpendCard({
  workspace,
  startingBalanceMinor,
  remainingBudgetMinor,
}: SafeToSpendCardProps) {
  const subscriptionMonth = currentMonth();
  const subscriptionsQuery = useSubscriptions(workspace, monthStart(subscriptionMonth));

  // A pending or failed query projects no renewals rather than blocking the card; the guidance
  // line below says so instead of presenting the week as bill-free.
  const subscriptions = forecastSubscriptions(
    subscriptionsQuery.data?.items ?? [],
    workspaceCurrency(),
  );

  const daysLeftInWeek = getDaysLeftInWeek(new Date(), "monday");
  const forecast = projectCashflow({ startingBalanceMinor, subscriptions, horizonDays: 30 });
  const envelopeMinor = Math.max(0, remainingBudgetMinor ?? startingBalanceMinor);
  const renewalLookup = subscriptionsQuery.isPending
    ? "pending"
    : subscriptionsQuery.isError
      ? "error"
      : "ready";
  const safeAmountMinor = safeToSpend({
    remainingWeeklyEnvelopeMinor: envelopeMinor,
    daysLeftInWeek,
    forecast: { minProjectedBalanceMinor: forecast.minProjectedBalanceMinor },
  });
  const hasBasis = hasSpendingBasis({ startingBalanceMinor, remainingBudgetMinor });
  const alert = overspendingAlert({ safeToSpendMinor: safeAmountMinor, forecast, hasBasis });
  const alertMessage = alert ? overspendingAlertMessage(alert) : null;
  const guidance = guidanceText(renewalLookup, hasBasis);

  return (
    <section
      className="overview-stat tone-brand safe-to-spend-stat"
      aria-labelledby="safe-to-spend-title"
    >
      <div className="overview-stat-heading">
        <h2 id="safe-to-spend-title">Safe to spend this week</h2>
        <span className="overview-stat-icon">
          <ShieldCheck size={16} aria-hidden="true" />
        </span>
      </div>
      <OverviewStatValue amountMinor={safeAmountMinor} currency={workspaceCurrency()} />
      <div className="safe-to-spend-meta">
        <span className="safe-to-spend-pill">
          {daysLeftInWeek} day{daysLeftInWeek === 1 ? "" : "s"} left
        </span>
        <Link className="safe-to-spend-renewals" to="/app/subscriptions?view=forecast">
          <CalendarClock size={13} aria-hidden="true" />
          Bills
        </Link>
      </div>
      {alertMessage ? (
        <div className="safe-to-spend-alert" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <strong>{alertMessage.title}</strong>
            <p>{alertMessage.body}</p>
          </div>
        </div>
      ) : null}
      {guidance ? <p className="safe-to-spend-guidance">{guidance}</p> : null}
    </section>
  );
}
