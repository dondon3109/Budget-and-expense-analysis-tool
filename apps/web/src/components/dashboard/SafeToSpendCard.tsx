import {
  getDaysLeftInWeek,
  projectCashflow,
  safeToSpend,
  type CashflowForecastOptions,
} from "@zoption/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

import { getSubscriptions } from "../../lib/api";
import { currentMonth, monthStart } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./SafeToSpendCard.css";

export interface SafeToSpendCardProps {
  workspace: AuthenticatedWorkspace;
  startingBalanceMinor: number;
  remainingBudgetMinor?: number;
}

/**
 * The guidance line follows the renewal lookup as well as the amount, so a lookup that is
 * still running or has failed is never described as a week with no bills in it.
 */
function guidanceText(
  renewalLookup: "pending" | "error" | "ready",
  safeAmountMinor: number,
  activeBillCount: number,
): string {
  if (renewalLookup === "pending") return "Checking your renewals, so this figure may still fall.";
  if (renewalLookup === "error") {
    return "Renewals could not be loaded, so this figure may be optimistic.";
  }
  if (safeAmountMinor <= 0) {
    return "Keep spending minimal until your next planned deposit or balance adjustment.";
  }
  return `Forward guidance accounting for ${activeBillCount} active recurring bill${
    activeBillCount === 1 ? "" : "s"
  } and scheduled obligations.`;
}

/**
 * Dashboard hero for what is safe to spend today: the remaining weekly envelope paced
 * across the days left in the week, capped by a 30-day projection of the active
 * subscription renewals.
 */
export function SafeToSpendCard({
  workspace,
  startingBalanceMinor,
  remainingBudgetMinor,
}: SafeToSpendCardProps) {
  const subscriptionMonth = currentMonth();
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(subscriptionMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(subscriptionMonth)),
  });

  // A pending or failed query projects no renewals rather than blocking the card; the guidance
  // line below says so instead of presenting the week as bill-free.
  const activeSubscriptions = (subscriptionsQuery.data?.items ?? []).filter(
    (item) => item.status === "active",
  );
  const subscriptions: CashflowForecastOptions["subscriptions"] = activeSubscriptions.map(
    (item) => ({
      id: item.id,
      name: item.name,
      amountMinor: item.amountMinor,
      billingCycle: item.billingCycle,
      nextBillingDate: item.nextBillingDate || item.billingDate || "",
      status: item.status,
      categoryName: item.categoryName,
    }),
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

  return (
    <section className="panel safe-to-spend-panel" aria-labelledby="safe-to-spend-title">
      <div className="panel-heading">
        <div>
          <h2 id="safe-to-spend-title">Safe to spend this week</h2>
          <p>Accounts for upcoming renewals and the days left in the week.</p>
        </div>
      </div>
      <div className="safe-to-spend-amount-row">
        <strong className="safe-to-spend-amount">{formatMoney(safeAmountMinor)}</strong>
        <div className="safe-to-spend-meta">
          <span className="safe-to-spend-pill">
            {daysLeftInWeek} day{daysLeftInWeek === 1 ? "" : "s"} left
          </span>
          <Link className="safe-to-spend-renewals" to="/app/subscriptions">
            <CalendarClock size={13} aria-hidden="true" />
            Renewals
          </Link>
        </div>
      </div>
      <p className="safe-to-spend-guidance">
        {guidanceText(renewalLookup, safeAmountMinor, activeSubscriptions.length)}
      </p>
    </section>
  );
}
