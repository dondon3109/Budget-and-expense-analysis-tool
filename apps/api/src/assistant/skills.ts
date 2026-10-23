import type { AssistantSkillId } from "@zoption/shared";

import type { RequiredToolGroup } from "./turn-policy";

interface AssistantSkillPlan {
  /** Read before the first provider call, so the model answers in one call. */
  groups: RequiredToolGroup[];
  /** Resolved like a user's own words, so it gets the same labels and bounds. */
  period?: "this month" | "last month";
  /** Sent in the turn context, never the shared rules, so the cached prefix stays stable. */
  guidance: string;
}

/**
 * What each built-in skill reads and covers. Every group here must have a backend read in
 * answer-validation's TOOL_FOR_GROUP, because a skill's records are fetched before the model
 * is asked; a projection that needs the user's inputs cannot be a skill group.
 */
export const ASSISTANT_SKILL_PLANS: Record<AssistantSkillId, AssistantSkillPlan> = {
  monthly_checkin: {
    groups: ["period_summary", "budget_comparison", "category_spending"],
    period: "this month",
    guidance:
      "Monthly check-in: cover income against spending so far, any budget at or over its limit, and the two or three largest spending categories. End with one practical next step.",
  },
  last_month_review: {
    groups: ["period_summary", "category_spending", "anomaly"],
    period: "last month",
    guidance:
      "Last month review: cover income against spending, the largest categories, and anything unusual compared with earlier months. End with one practical next step.",
  },
  bills_due: {
    groups: ["subscription_list", "account_balance"],
    guidance:
      "Bills due soon: list the bills due in the window by date with their amounts and the total due, then name the accounts they charge with those accounts' recorded balances. Never subtract bills from a balance yourself.",
  },
  find_savings: {
    groups: ["subscription_list", "recurring", "category_spending"],
    period: "last month",
    guidance:
      "Find savings: point to two or three concrete places to cut back, drawing on last month's largest categories, active subscriptions and their monthly cost, and any recurring charge whose price rose. Never claim a subscription is unused.",
  },
  goals_checkup: {
    groups: ["goals_overview"],
    guidance:
      "Goals and debt check-up: summarize each active goal's progress and remaining amount with its target date, then the active debts' total balance and minimum payments. Offer a payoff plan or a monthly savings target as the next step.",
  },
};
