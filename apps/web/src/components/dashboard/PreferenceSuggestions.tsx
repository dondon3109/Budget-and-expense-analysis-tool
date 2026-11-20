import {
  openPreferenceSuggestions,
  preferenceSuggestions,
  type GoalCtaAction,
  type SuggestionSignal,
} from "@zoption/shared";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useMoneyPreferences } from "../../queries/goalProfile";
import { financialGoalsQueryOptions } from "../../queries/goals";
import { subscriptionsQueryOptions } from "../../queries/subscriptions";
import { GoalTarget } from "./GoalChecklist";
import "./PreferenceSuggestions.css";

interface PreferenceSuggestionsProps {
  workspace: AuthenticatedWorkspace;
  /** Already loaded by the dashboard. */
  hasBudget: boolean;
  /** `YYYY-MM-01`, for the subscriptions read. */
  month: string;
  onAction: (action: GoalCtaAction) => void;
}

/**
 * Next steps tailored to the money habits from onboarding. Each hides once the workspace already
 * has what it asks for; the card is hidden when none are left, until loaded, or once closed.
 */
export function PreferenceSuggestions({
  workspace,
  hasBudget,
  month,
  onAction,
}: PreferenceSuggestionsProps) {
  const [closed, setClosed] = useState(false);
  const preferences = useMoneyPreferences(workspace).data;
  const candidates = preferenceSuggestions(preferences);
  const needs = (signal: SuggestionSignal) => candidates.some((item) => item.signal === signal);
  const goalsQuery = useQuery({
    ...financialGoalsQueryOptions(workspace),
    enabled: needs("has_savings_goal"),
  });
  const subscriptionsQuery = useQuery({
    ...subscriptionsQueryOptions(workspace, month),
    enabled: needs("has_subscription"),
  });
  if (closed || candidates.length === 0) return null;

  const done = {
    has_budget: hasBudget,
    has_savings_goal: goalsQuery.data && goalsQuery.data.items.length > 0,
    has_subscription: subscriptionsQuery.data && subscriptionsQuery.data.items.length > 0,
  };
  // Wait for every signal so a suggestion never flashes in and then disappears.
  if (candidates.some((item) => done[item.signal] === undefined)) return null;
  const open = openPreferenceSuggestions(preferences, {
    has_budget: done.has_budget,
    has_savings_goal: done.has_savings_goal === true,
    has_subscription: done.has_subscription === true,
  });
  if (open.length === 0) return null;

  return (
    <section className="preference-suggestions" aria-labelledby="preference-suggestions-title">
      <div className="preference-suggestions-header">
        <h2 id="preference-suggestions-title">Suggested for you</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Dismiss suggestions"
          onClick={() => setClosed(true)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ul>
        {open.map((item) => (
          <li key={item.id}>
            <GoalTarget
              target={item.target}
              className="preference-suggestions-action"
              onAction={onAction}
            >
              {item.title}
            </GoalTarget>
            <p>{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
