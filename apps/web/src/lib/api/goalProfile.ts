import { goalProfileSchema, type GoalProfile, type GoalSelection } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

const PATH = "/api/app/profile/goal";

export async function getGoalProfile(workspace: AuthenticatedWorkspace): Promise<GoalProfile> {
  return goalProfileSchema.parse(await requestJson(workspace, PATH));
}

export async function saveGoal(
  workspace: AuthenticatedWorkspace,
  input: { goal: GoalSelection["goal"]; otherText?: string | null },
): Promise<GoalProfile> {
  return goalProfileSchema.parse(
    await requestJson(workspace, PATH, { method: "PUT", body: JSON.stringify(input) }),
  );
}

export async function skipGoal(workspace: AuthenticatedWorkspace): Promise<GoalProfile> {
  return goalProfileSchema.parse(await requestJson(workspace, `${PATH}/skip`, { method: "POST" }));
}

/** Records that the goal screen was shown; the server keeps one row per workspace. */
export async function markGoalShown(workspace: AuthenticatedWorkspace): Promise<void> {
  await requestJson<void>(workspace, `${PATH}/shown`, { method: "POST" });
}
