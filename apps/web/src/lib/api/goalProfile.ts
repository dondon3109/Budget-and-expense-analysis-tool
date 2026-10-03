import {
  goalsProfileSchema,
  type GoalsProfile,
  type GoalsSelection,
  type PrimaryGoal,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

const PATH = "/api/app/profile";

/** The stored goals, with `goal` as the lead one that drives the first-run experience. */
export type GoalProfileView = GoalsProfile & { goal: PrimaryGoal | null };

function toView(profile: GoalsProfile): GoalProfileView {
  return { ...profile, goal: profile.goals[0] ?? null };
}

export async function getGoalProfile(workspace: AuthenticatedWorkspace): Promise<GoalProfileView> {
  return toView(goalsProfileSchema.parse(await requestJson(workspace, `${PATH}/goals`)));
}

export async function saveGoals(
  workspace: AuthenticatedWorkspace,
  input: { goals: GoalsSelection["goals"]; otherText?: string | null },
): Promise<GoalProfileView> {
  return toView(
    goalsProfileSchema.parse(
      await requestJson(workspace, `${PATH}/goals`, { method: "PUT", body: JSON.stringify(input) }),
    ),
  );
}

/** Skipping keeps any goals already chosen, so the stored list is read back. */
export async function skipGoal(workspace: AuthenticatedWorkspace): Promise<GoalProfileView> {
  await requestJson(workspace, `${PATH}/goal/skip`, { method: "POST" });
  return getGoalProfile(workspace);
}

/** Records that the goal screen was shown; the server keeps one row per workspace. */
export async function markGoalShown(workspace: AuthenticatedWorkspace): Promise<void> {
  await requestJson<void>(workspace, `${PATH}/goal/shown`, { method: "POST" });
}
