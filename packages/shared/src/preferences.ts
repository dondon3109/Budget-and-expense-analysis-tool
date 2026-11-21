// Money preferences asked during onboarding: how the user is paid, how they like to budget, and
// which spending they want to watch. They tailor the in-app suggestions, the assistant's starter
// prompt, and the assistant's tone. Keys are stable (stored in D1); labels are display-only.

import { z } from "zod";

import type { Currency } from "./currencies";
import type { GoalCtaTarget } from "./goalConfig";

export const incomeCadences = ["monthly", "semi_monthly", "weekly", "irregular"] as const;
export type IncomeCadence = (typeof incomeCadences)[number];

export const incomeCadenceLabels: Record<IncomeCadence, string> = {
  monthly: "Once a month",
  semi_monthly: "Twice a month (kinsenas)",
  weekly: "Every week",
  irregular: "It varies (freelance, sideline, commissions)",
};

/** Pay cadence label localized to the workspace currency. */
export function incomeCadenceLabel(cadence: IncomeCadence, currency: Currency = "PHP"): string {
  if (cadence === "semi_monthly" && currency !== "PHP") return "Twice a month";
  return incomeCadenceLabels[cadence];
}

export const budgetingStyles = [
  "category_limits",
  "fifty_thirty_twenty",
  "zero_based",
  "not_sure",
] as const;
export type BudgetingStyle = (typeof budgetingStyles)[number];

export const budgetingStyleLabels: Record<BudgetingStyle, string> = {
  category_limits: "Set limits for a few categories",
  fifty_thirty_twenty: "50/30/20: needs, wants, savings",
  zero_based: "Give every peso a job",
  not_sure: "Not sure yet",
};

/** Budgeting style label localized to the workspace currency. */
export function budgetingStyleLabel(style: BudgetingStyle, currency: Currency = "PHP"): string {
  if (style === "zero_based" && currency !== "PHP") return "Zero-based: give all income a job";
  return budgetingStyleLabels[style];
}

export const spendingFocuses = [
  "food",
  "transport",
  "bills",
  "shopping",
  "family_support",
  "fun",
] as const;
export type SpendingFocus = (typeof spendingFocuses)[number];

export const spendingFocusLabels: Record<SpendingFocus, string> = {
  food: "Food and groceries",
  transport: "Transport",
  bills: "Bills and subscriptions",
  shopping: "Shopping",
  family_support: "Family support / padala",
  fun: "Going out and hobbies",
};

/** Spending focus label localized to the workspace currency. */
export function spendingFocusLabel(focus: SpendingFocus, currency: Currency = "PHP"): string {
  if (focus === "family_support" && currency !== "PHP") return "Family support";
  return spendingFocusLabels[focus];
}

export const SPENDING_FOCUS_MAX = 3;

/** Every field is optional to answer: null (or an empty list) means not answered. */
export const moneyPreferencesSchema = z
  .object({
    incomeCadence: z.enum(incomeCadences).nullable(),
    budgetingStyle: z.enum(budgetingStyles).nullable(),
    spendingFocus: z
      .array(z.enum(spendingFocuses))
      .max(SPENDING_FOCUS_MAX, `Pick up to ${SPENDING_FOCUS_MAX}.`)
      .refine((focus) => new Set(focus).size === focus.length, "Pick each one once."),
  })
  .strict();

export type MoneyPreferences = z.infer<typeof moneyPreferencesSchema>;

export const emptyMoneyPreferences: MoneyPreferences = {
  incomeCadence: null,
  budgetingStyle: null,
  spendingFocus: [],
};

export function hasMoneyPreferences(preferences: MoneyPreferences | null | undefined): boolean {
  return Boolean(
    preferences &&
    (preferences.incomeCadence !== null ||
      preferences.budgetingStyle !== null ||
      preferences.spendingFocus.length > 0),
  );
}

/** What each client can tell from data it already loads; a suggestion hides once its signal is true. */
export const suggestionSignals = ["has_budget", "has_savings_goal", "has_subscription"] as const;
export type SuggestionSignal = (typeof suggestionSignals)[number];

export interface PreferenceSuggestion {
  id: string;
  title: string;
  detail: string;
  /** The same targets as the goal CTAs, so each client maps them the way it already does. */
  target: GoalCtaTarget;
  signal: SuggestionSignal;
}

export const PREFERENCE_SUGGESTIONS_MAX = 3;

const cadenceSuggestions: Record<IncomeCadence, PreferenceSuggestion> = {
  monthly: {
    id: "plan_on_payday",
    title: "Plan the month on payday",
    detail: "Set your budgets right after payday so the whole month's spending has a plan.",
    target: "/app/budgets",
    signal: "has_budget",
  },
  semi_monthly: {
    id: "budget_per_payday",
    title: "Budget for each payday",
    detail:
      "You're paid on the 15th and 30th. Plan each half so the first payday doesn't run out before the second.",
    target: "/app/budgets",
    signal: "has_budget",
  },
  weekly: {
    id: "weekly_to_monthly",
    title: "Turn weekly pay into a monthly plan",
    detail: "Budgets run monthly. Set limits from about four weeks of pay so every week has room.",
    target: "/app/budgets",
    signal: "has_budget",
  },
  irregular: {
    id: "buffer_month",
    title: "Build a buffer for lean months",
    detail: "When income varies, save one month of expenses as a goal so a slow month never hurts.",
    target: "/app/plan",
    signal: "has_savings_goal",
  },
};

function styleSuggestion(
  style: BudgetingStyle,
  focus: readonly SpendingFocus[],
  currency: Currency = "PHP",
): PreferenceSuggestion {
  switch (style) {
    case "category_limits": {
      const named = focus.map((key) => spendingFocusLabel(key, currency).toLowerCase()).join(", ");
      return {
        id: "category_limits",
        title: "Set your first category limits",
        detail: named
          ? `Start with the ones you want to watch: ${named}.`
          : "Start with the two or three categories you spend the most on.",
        target: "/app/budgets",
        signal: "has_budget",
      };
    }
    case "fifty_thirty_twenty":
      return {
        id: "fifty_thirty_twenty",
        title: "Try the 50/30/20 split",
        detail:
          "Half of your income to needs, 30% to wants, 20% to savings. The calculator on Budgets does the math.",
        target: "/app/budgets",
        signal: "has_budget",
      };
    case "zero_based":
      return {
        id: "zero_based",
        title: currency === "PHP" ? "Give every peso a job" : "Give all your income a job",
        detail:
          "Budget your whole income across categories and savings until nothing is unplanned.",
        target: "/app/budgets",
        signal: "has_budget",
      };
    case "not_sure":
      return {
        id: "pick_a_style",
        title: "Find a budgeting style that fits",
        detail: "Ask the AI to compare a few simple styles against your income and spending.",
        target: "/app/assistant",
        signal: "has_budget",
      };
  }
}

const billsSuggestion: PreferenceSuggestion = {
  id: "add_bills",
  title: "Add your bills",
  detail: "Add rent, utilities, and subscriptions so Zoption reminds you before each one is due.",
  target: "/app/subscriptions",
  signal: "has_subscription",
};

/**
 * The suggestions the preferences call for, most specific first: the budgeting style, then the
 * pay cadence, then bills. One per signal, so two cards never send the user to the same first
 * step. Callers drop the ones whose signal is already true and show at most
 * `PREFERENCE_SUGGESTIONS_MAX`.
 */
export function preferenceSuggestions(
  preferences: MoneyPreferences | null | undefined,
  currency: Currency = "PHP",
): PreferenceSuggestion[] {
  if (!preferences) return [];
  const candidates: PreferenceSuggestion[] = [];
  if (preferences.budgetingStyle) {
    candidates.push(
      styleSuggestion(preferences.budgetingStyle, preferences.spendingFocus, currency),
    );
  }
  if (preferences.incomeCadence) candidates.push(cadenceSuggestions[preferences.incomeCadence]);
  if (preferences.spendingFocus.includes("bills")) candidates.push(billsSuggestion);

  const seen = new Set<SuggestionSignal>();
  return candidates.filter((suggestion) => {
    if (seen.has(suggestion.signal)) return false;
    seen.add(suggestion.signal);
    return true;
  });
}

/** The open suggestions given what the workspace already has, capped for display. */
export function openPreferenceSuggestions(
  preferences: MoneyPreferences | null | undefined,
  done: Readonly<Record<SuggestionSignal, boolean>>,
  currency: Currency = "PHP",
): PreferenceSuggestion[] {
  return preferenceSuggestions(preferences, currency)
    .filter((suggestion) => !done[suggestion.signal])
    .slice(0, PREFERENCE_SUGGESTIONS_MAX);
}

const focusPrompts: Record<SpendingFocus, string> = {
  food: "How much did I spend on food this month?",
  transport: "How much am I spending on transport?",
  bills: "Which bills are due soon?",
  shopping: "How much did I spend on shopping this month?",
  family_support: "How much have I sent to family this month?",
  fun: "How much did I spend going out this month?",
};

/**
 * An assistant starter prompt for the preferences, or null. Pay timing leads where it changes the
 * question most (twice-monthly and irregular pay); otherwise the first spending focus does.
 */
export function preferenceStarterPrompt(
  preferences: MoneyPreferences | null | undefined,
): string | null {
  if (!preferences) return null;
  if (preferences.incomeCadence === "semi_monthly") {
    return "How much can I spend until my next payday?";
  }
  if (preferences.incomeCadence === "irregular") {
    return "How much should I set aside from a good month?";
  }
  const focus = preferences.spendingFocus[0];
  return focus ? focusPrompts[focus] : null;
}

/**
 * Starter prompts that lead a client's default list: the goal's, then the preferences', with
 * duplicates removed and the list kept at its original length.
 */
export function leadStarterPrompts(
  defaults: readonly string[],
  leads: readonly (string | null)[],
): string[] {
  const picked = leads.filter((prompt): prompt is string => Boolean(prompt));
  const merged = [...new Set([...picked, ...defaults])];
  return merged.slice(0, Math.max(defaults.length, picked.length));
}

/** One line for the assistant's turn context, using the stable keys; null when nothing is set. */
export function preferencesContextLine(
  preferences: MoneyPreferences | null | undefined,
): string | null {
  if (!preferences || !hasMoneyPreferences(preferences)) return null;
  const parts = [
    preferences.incomeCadence ? `paid ${preferences.incomeCadence}` : null,
    preferences.budgetingStyle ? `budgeting style ${preferences.budgetingStyle}` : null,
    preferences.spendingFocus.length > 0
      ? `watching ${preferences.spendingFocus.join(", ")}`
      : null,
  ].filter(Boolean);
  return `User preferences: ${parts.join("; ")}.`;
}
