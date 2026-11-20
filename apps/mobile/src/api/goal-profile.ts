import {
  goalProfileSchema,
  goalsProfileSchema,
  moneyPreferencesSchema,
  type GoalProfile,
  type GoalsProfile,
  type GoalsSelection,
  type MoneyPreferences,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface GoalProfileApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// Choices live on /goals. Skip and shown stay on the single-goal routes, which installed builds
// still use, so skip answers in the older single-goal shape.
const GOALS_PATH = "/api/app/profile/goals";
const PATH = "/api/app/profile/goal";
const PREFERENCES_PATH = "/api/app/profile/preferences";

export function getGoalsProfile(api: GoalProfileApi): Promise<GoalsProfile> {
  return apiRequest({
    ...api,
    path: GOALS_PATH,
    method: "GET",
    fallback: "Zoption could not read your goal. Try again shortly.",
    decode: (value) => goalsProfileSchema.parse(value),
  });
}

/** `goals` order is priority: the first is the lead goal. */
export function saveGoals(
  api: GoalProfileApi,
  input: { goals: GoalsSelection["goals"]; otherText?: string | null },
): Promise<GoalsProfile> {
  return apiRequest({
    ...api,
    path: GOALS_PATH,
    method: "PUT",
    body: input,
    fallback: "Zoption could not save your goal. Try again shortly.",
    decode: (value) => goalsProfileSchema.parse(value),
  });
}

export function skipGoal(api: GoalProfileApi): Promise<GoalProfile> {
  return apiRequest({
    ...api,
    path: `${PATH}/skip`,
    method: "POST",
    fallback: "Zoption could not skip this step. Try again shortly.",
    decode: (value) => goalProfileSchema.parse(value),
  });
}

/** Records that the goal screen was shown; the server keeps one row per workspace. */
export function markGoalShown(api: GoalProfileApi): Promise<void> {
  return apiRequest({
    ...api,
    path: `${PATH}/shown`,
    method: "POST",
    fallback: "Zoption could not record that step.",
    decode: () => undefined,
  });
}

/** Pay cadence, budgeting style, and spending focus; unanswered fields are null or empty. */
export function getMoneyPreferences(api: GoalProfileApi): Promise<MoneyPreferences> {
  return apiRequest({
    ...api,
    path: PREFERENCES_PATH,
    method: "GET",
    fallback: "Zoption could not read your money habits. Try again shortly.",
    decode: (value) => moneyPreferencesSchema.parse(value),
  });
}

export function saveMoneyPreferences(
  api: GoalProfileApi,
  input: MoneyPreferences,
): Promise<MoneyPreferences> {
  return apiRequest({
    ...api,
    path: PREFERENCES_PATH,
    method: "PUT",
    body: input,
    fallback: "Zoption could not save your money habits. Try again shortly.",
    decode: (value) => moneyPreferencesSchema.parse(value),
  });
}
