// Goal-based onboarding: why a user came to Zoption. This is the single place to edit goal keys,
// labels, and event names. Keys are stable (stored in D1); labels are display-only.

import { z } from "zod";

export const primaryGoals = [
  "track_spending",
  "build_budget",
  "save_for_goal",
  "reduce_debt",
  "understand_habits",
  "just_exploring",
  "other",
] as const;

export type PrimaryGoal = (typeof primaryGoals)[number];

export const primaryGoalLabels: Record<PrimaryGoal, string> = {
  track_spending: "Track where my money goes",
  build_budget: "Create and stick to a monthly budget",
  save_for_goal: "Save for something specific",
  reduce_debt: "Pay off debt / utang",
  understand_habits: "Understand my spending habits with AI",
  just_exploring: "Just looking around",
  other: "Other",
};

export const goalEventNames = [
  "onboarding_goal_shown",
  "onboarding_goal_selected",
  "onboarding_goal_skipped",
  "first_action_completed",
  "goal_changed",
] as const;

export type GoalEventName = (typeof goalEventNames)[number];

export const GOAL_OTHER_TEXT_MAX_LENGTH = 140;

/**
 * Free text is the only user-written field. Control and invisible format characters and angle
 * brackets are dropped and whitespace is collapsed before the length cap, so what is stored is
 * plain text. Blank becomes null.
 */
const goalOtherTextSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/[\p{Cc}\p{Cf}<>]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(
    z
      .string()
      .max(GOAL_OTHER_TEXT_MAX_LENGTH, `Keep it to ${GOAL_OTHER_TEXT_MAX_LENGTH} characters.`),
  )
  .transform((value) => value || null);

/** Choosing a goal. Text is kept only for 'other' and ignored for every other goal. */
export const goalSelectionSchema = z
  .object({ goal: z.enum(primaryGoals), otherText: goalOtherTextSchema.nullish() })
  .strict()
  .transform(({ goal, otherText }) => ({
    goal,
    otherText: goal === "other" ? (otherText ?? null) : null,
  }));

export type GoalSelection = z.infer<typeof goalSelectionSchema>;

/** What the workspace stores. `goal` is null for skippers, existing users, and new signups. */
export const goalProfileSchema = z
  .object({
    goal: z.enum(primaryGoals).nullable(),
    otherText: z.string().max(GOAL_OTHER_TEXT_MAX_LENGTH).nullable(),
    selectedAt: z.string().nullable(),
    skipped: z.boolean(),
  })
  .strict();

export type GoalProfile = z.infer<typeof goalProfileSchema>;
