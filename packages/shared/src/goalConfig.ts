// What each onboarding goal changes in the product: the first-action CTA, the dashboard emphasis,
// the AI starter prompt, and the first-run checklist. One table so web copy and tests agree.
// 'other', a skipped goal, and no goal all use the default entry, which changes nothing.

import type { PrimaryGoal } from "./goals";

/** In-app actions a CTA can trigger instead of navigating. */
export const goalCtaActions = ["add_transaction", "import_wizard"] as const;
export type GoalCtaAction = (typeof goalCtaActions)[number];

/** Routes a CTA can open. Each must exist in `apps/web/src/App.tsx`. */
export const goalCtaRoutes = ["/app/budgets", "/app/plan", "/app/assistant"] as const;
export type GoalCtaRoute = (typeof goalCtaRoutes)[number];

export type GoalCtaTarget = GoalCtaAction | GoalCtaRoute;

export function isGoalCtaRoute(target: GoalCtaTarget): target is GoalCtaRoute {
  return target.startsWith("/");
}

/** Which dashboard section leads: the recent list, budget vs actual, goals/debts, or the default. */
export const dashboardEmphases = ["overview", "recent_transactions", "budget", "plan"] as const;
export type DashboardEmphasis = (typeof dashboardEmphases)[number];

/** Completion signals the dashboard can derive from data it already loads. */
export const goalChecklistSignals = [
  "has_transaction",
  "has_budget",
  "has_savings_goal",
  "has_debt",
  "has_assistant_thread",
] as const;
export type GoalChecklistSignal = (typeof goalChecklistSignals)[number];

export interface GoalChecklistItem {
  label: string;
  signal: GoalChecklistSignal;
  target: GoalCtaTarget;
}

export interface GoalConfig {
  cta: { label: string; target: GoalCtaTarget } | null;
  emphasis: DashboardEmphasis;
  /** Shown first among the assistant's suggestions; null keeps the default prompts. */
  starterPrompt: string | null;
  /** At most three items. */
  checklist: readonly GoalChecklistItem[];
}

export type GoalConfigKey = PrimaryGoal | "default";

const defaultConfig: GoalConfig = {
  cta: null,
  emphasis: "overview",
  starterPrompt: null,
  checklist: [],
};

export const goalConfigs: Record<GoalConfigKey, GoalConfig> = {
  default: defaultConfig,
  other: defaultConfig,
  track_spending: {
    cta: { label: "Log your first expense", target: "add_transaction" },
    emphasis: "recent_transactions",
    starterPrompt: "Where did my money go this week?",
    checklist: [
      { label: "Log your first expense", signal: "has_transaction", target: "add_transaction" },
      { label: "Set a monthly budget", signal: "has_budget", target: "/app/budgets" },
      {
        label: "Ask the AI about your spending",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
    ],
  },
  build_budget: {
    cta: { label: "Set your first budget", target: "/app/budgets" },
    emphasis: "budget",
    starterPrompt: "Help me build a budget from my income",
    checklist: [
      { label: "Set your first budget", signal: "has_budget", target: "/app/budgets" },
      { label: "Log an expense", signal: "has_transaction", target: "add_transaction" },
      {
        label: "Ask the AI to help with your budget",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
    ],
  },
  save_for_goal: {
    cta: { label: "Create a savings goal", target: "/app/plan" },
    emphasis: "plan",
    starterPrompt: "How fast can I reach my goal?",
    checklist: [
      { label: "Create a savings goal", signal: "has_savings_goal", target: "/app/plan" },
      { label: "Log an expense or income", signal: "has_transaction", target: "add_transaction" },
      {
        label: "Ask the AI about your goal",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
    ],
  },
  reduce_debt: {
    cta: { label: "Add a debt to track", target: "/app/plan" },
    emphasis: "plan",
    starterPrompt: "Make me a payoff plan",
    checklist: [
      { label: "Add a debt to track", signal: "has_debt", target: "/app/plan" },
      { label: "Log an expense or payment", signal: "has_transaction", target: "add_transaction" },
      {
        label: "Ask the AI for a payoff plan",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
    ],
  },
  understand_habits: {
    cta: { label: "Ask the AI about spending", target: "/app/assistant" },
    emphasis: "overview",
    starterPrompt: "What patterns do you see?",
    checklist: [
      {
        label: "Log or import your transactions",
        signal: "has_transaction",
        target: "add_transaction",
      },
      {
        label: "Ask the AI about your spending",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
      { label: "Set a monthly budget", signal: "has_budget", target: "/app/budgets" },
    ],
  },
  just_exploring: {
    cta: { label: "Import a spreadsheet", target: "import_wizard" },
    emphasis: "overview",
    starterPrompt: "What can Zoption do?",
    checklist: [
      {
        label: "Import a spreadsheet or log an expense",
        signal: "has_transaction",
        target: "import_wizard",
      },
      {
        label: "Ask the AI what Zoption can do",
        signal: "has_assistant_thread",
        target: "/app/assistant",
      },
    ],
  },
};

/** A missing or unknown goal (existing users, skippers) gets the default entry. */
export function goalConfigFor(goal: PrimaryGoal | null | undefined): GoalConfig {
  return goalConfigs[goal ?? "default"];
}
