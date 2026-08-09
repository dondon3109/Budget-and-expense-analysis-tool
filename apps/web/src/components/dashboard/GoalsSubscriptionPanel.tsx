import { useQuery } from "@tanstack/react-query";
import { Repeat2, Target } from "lucide-react";
import { Link } from "react-router-dom";

import { getFinancialGoals, getSubscriptions } from "../../lib/api";
import { currentMonth, monthStart } from "../../lib/calendar";
import { formatMoney, formatMonth } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

interface GoalsSubscriptionPanelProps {
  workspace: AuthenticatedWorkspace;
}

function formatTargetDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function GoalsSubscriptionPanel({ workspace }: GoalsSubscriptionPanelProps) {
  const subscriptionMonth = currentMonth();
  const goalsQuery = useQuery({
    queryKey: queryKeys.financialGoals(workspace),
    queryFn: () => getFinancialGoals(workspace),
  });
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(subscriptionMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(subscriptionMonth)),
  });

  const activeGoals = (goalsQuery.data?.items ?? []).filter((goal) => goal.status === "active");
  const subscriptionSummary = subscriptionsQuery.data;
  const activeSubscriptions =
    subscriptionSummary?.items.filter((item) => item.status === "active") ?? [];
  const totalSubscriptionCostMinor = activeSubscriptions.reduce(
    (total, subscription) => total + subscription.monthlyCostMinor,
    0,
  );

  return (
    <section className="panel goals-panel" aria-labelledby="goals-title">
      <div className="panel-heading">
        <div>
          <h2 id="goals-title">Goals and subscriptions</h2>
          <p>Your active savings goals and the monthly cost of your subscriptions.</p>
        </div>
      </div>
      <div className="goals-layout">
        <article className="goals-block">
          <div className="goals-block-heading">
            <Target size={17} aria-hidden="true" />
            <strong>Savings goals</strong>
          </div>
          {goalsQuery.isPending ? (
            <p className="insight-empty">Loading goals…</p>
          ) : activeGoals.length === 0 ? (
            <div className="goals-empty">
              <p className="insight-empty">No active goals yet.</p>
              <Link className="text-link" to="/app/plan">
                Add a goal on your planning ledger
              </Link>
            </div>
          ) : (
            <ul className="goals-list">
              {activeGoals.map((goal) => {
                const progress = Math.min(
                  100,
                  Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100),
                );
                return (
                  <li key={goal.id}>
                    <div className="goals-list-topline">
                      <strong>{goal.name}</strong>
                      <span>
                        {formatMoney(goal.currentAmountMinor)} of{" "}
                        {formatMoney(goal.targetAmountMinor)}
                      </span>
                    </div>
                    <div
                      className="goal-progress"
                      role="progressbar"
                      aria-label={`${goal.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goals-list-meta">
                      <span>{progress}% saved</span>
                      <span>Target {formatTargetDate(goal.targetDate)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
        <article className="goals-block subscriptions-block">
          <div className="goals-block-heading">
            <Repeat2 size={17} aria-hidden="true" />
            <strong>Subscription cost</strong>
          </div>
          {subscriptionsQuery.isPending ? (
            <p className="insight-empty">Loading subscriptions…</p>
          ) : subscriptionSummary ? (
            <>
              <div className="subscription-total">
                <strong>{formatMoney(totalSubscriptionCostMinor)}</strong>
                <span>
                  {formatMonth(subscriptionMonth)} · {activeSubscriptions.length} active plan
                  {activeSubscriptions.length === 1 ? "" : "s"}
                </span>
              </div>
              <Link className="text-link" to="/app/subscriptions">
                {activeSubscriptions.length === 0
                  ? "Add a subscription to track recurring costs"
                  : "Manage subscriptions"}
              </Link>
            </>
          ) : (
            <p className="insight-empty">Subscription cost could not be loaded.</p>
          )}
        </article>
      </div>
    </section>
  );
}
