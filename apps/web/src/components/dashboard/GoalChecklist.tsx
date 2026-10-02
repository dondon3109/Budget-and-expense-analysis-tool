import {
  goalConfigFor,
  isGoalCtaRoute,
  type GoalChecklistSignal,
  type GoalCtaAction,
  type GoalCtaTarget,
  type PrimaryGoal,
} from "@zoption/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { getAssistantThreads } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { debtsQueryOptions } from "../../queries/debts";
import { financialGoalsQueryOptions } from "../../queries/goals";
import "./GoalChecklist.css";

/** Renders a CTA or checklist target: a link for a route, a button for an in-app action. */
function GoalTarget({
  target,
  className,
  onAction,
  children,
}: {
  target: GoalCtaTarget;
  className: string;
  onAction: (action: GoalCtaAction) => void;
  children: ReactNode;
}) {
  if (isGoalCtaRoute(target)) {
    return (
      <Link className={className} to={target}>
        {children}
      </Link>
    );
  }
  return (
    <button className={className} type="button" onClick={() => onAction(target)}>
      {children}
    </button>
  );
}

/** The goal's first-action button; null when there is no goal, so callers keep today's actions. */
export function GoalCtaButton({
  goal,
  onAction,
}: {
  goal: PrimaryGoal | null | undefined;
  onAction: (action: GoalCtaAction) => void;
}) {
  const cta = goalConfigFor(goal).cta;
  if (!cta) return null;
  return (
    <GoalTarget target={cta.target} className="button primary" onAction={onAction}>
      {cta.label}
    </GoalTarget>
  );
}

interface GoalChecklistProps {
  workspace: AuthenticatedWorkspace;
  goal: PrimaryGoal | null | undefined;
  /** Already loaded by the dashboard. */
  signals: Pick<Record<GoalChecklistSignal, boolean>, "has_transaction" | "has_budget">;
  onAction: (action: GoalCtaAction) => void;
}

/** First-run checklist for the chosen goal (at most three items). Hidden once finished or closed. */
export function GoalChecklist({ workspace, goal, signals, onAction }: GoalChecklistProps) {
  const items = goalConfigFor(goal).checklist;
  const [closed, setClosed] = useState(false);
  const needs = (signal: GoalChecklistSignal) => items.some((item) => item.signal === signal);
  const goalsQuery = useQuery({
    ...financialGoalsQueryOptions(workspace),
    enabled: needs("has_savings_goal"),
  });
  const debtsQuery = useQuery({ ...debtsQueryOptions(workspace), enabled: needs("has_debt") });
  const threadsQuery = useQuery({
    queryKey: queryKeys.assistantThreads(workspace),
    queryFn: () => getAssistantThreads(workspace),
    enabled: needs("has_assistant_thread"),
  });
  if (closed || items.length === 0) return null;

  const done: Record<GoalChecklistSignal, boolean | undefined> = {
    ...signals,
    has_savings_goal: goalsQuery.data && goalsQuery.data.items.length > 0,
    has_debt: debtsQuery.data && debtsQuery.data.items.length > 0,
    has_assistant_thread: threadsQuery.data && threadsQuery.data.items.length > 0,
  };
  // Wait for every signal so an item never flashes open and then ticks itself off.
  if (items.some((item) => done[item.signal] === undefined)) return null;
  if (items.every((item) => done[item.signal])) return null;

  return (
    <section className="goal-checklist" aria-labelledby="goal-checklist-title">
      <div className="goal-checklist-header">
        <h2 id="goal-checklist-title">Get started with your goal</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Dismiss checklist"
          onClick={() => setClosed(true)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ul>
        {items.map((item) => {
          const complete = done[item.signal] === true;
          return (
            <li key={item.label} data-done={complete}>
              <span className="goal-checklist-mark" aria-hidden="true">
                {complete && <Check size={12} />}
              </span>
              {complete ? (
                <span className="goal-checklist-label">{item.label}</span>
              ) : (
                <GoalTarget
                  target={item.target}
                  className="goal-checklist-item-action"
                  onAction={onAction}
                >
                  <span className="goal-checklist-label">{item.label}</span>
                </GoalTarget>
              )}
              {complete && <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
