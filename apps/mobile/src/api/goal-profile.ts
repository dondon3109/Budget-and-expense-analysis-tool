import { goalProfileSchema, type GoalProfile, type GoalSelection } from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface GoalProfileApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const PATH = "/api/app/profile/goal";
const decodeProfile = (value: unknown) => goalProfileSchema.parse(value);

export function getGoalProfile(api: GoalProfileApi): Promise<GoalProfile> {
  return apiRequest({
    ...api,
    path: PATH,
    method: "GET",
    fallback: "Zoption could not read your goal. Try again shortly.",
    decode: decodeProfile,
  });
}

export function saveGoal(
  api: GoalProfileApi,
  input: { goal: GoalSelection["goal"]; otherText?: string | null },
): Promise<GoalProfile> {
  return apiRequest({
    ...api,
    path: PATH,
    method: "PUT",
    body: input,
    fallback: "Zoption could not save your goal. Try again shortly.",
    decode: decodeProfile,
  });
}

export function skipGoal(api: GoalProfileApi): Promise<GoalProfile> {
  return apiRequest({
    ...api,
    path: `${PATH}/skip`,
    method: "POST",
    fallback: "Zoption could not skip this step. Try again shortly.",
    decode: decodeProfile,
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
