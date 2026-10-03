import { primaryGoalLabels } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useGoalProfile, useSaveGoals } from "../../queries/goalProfile";
import { GoalPicker } from "../onboarding/GoalPicker";

export function GoalSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const profileQuery = useGoalProfile(workspace);
  const saveGoals = useSaveGoals(workspace);
  const profile = profileQuery.data;

  return (
    <section
      id="primary-goal"
      className="settings-section"
      aria-labelledby="primary-goal-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="primary-goal-title">Your goals</h2>
          <p>What you want Zoption for. You can change them any time.</p>
        </div>
        <span>Workspace</span>
      </div>

      {profileQuery.isPending ? (
        <p className="settings-helper" role="status">
          Loading your goal…
        </p>
      ) : !profile ? (
        <p className="form-error" role="alert">
          Your goal could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <div className="settings-form">
          <p className="settings-helper" role="status">
            {profile.goals.length > 0
              ? `Current goals: ${profile.goals
                  .map(
                    (goal) =>
                      primaryGoalLabels[goal] +
                      (goal === "other" && profile.otherText ? ` (${profile.otherText})` : ""),
                  )
                  .join(", ")}`
              : "Not set. Choose what fits you best, whenever you like."}
          </p>
          <GoalPicker
            legend="Change your goals"
            goals={profile.goals}
            otherText={profile.otherText}
            disabled={saveGoals.isPending}
            confirmLabel="Save goals"
            onChoose={(choice) => saveGoals.mutate(choice)}
          />
          {saveGoals.isSuccess && (
            <p className="settings-helper" role="status">
              Thank you! Your goals are saved.
            </p>
          )}
          {saveGoals.isError && (
            <p className="form-error" role="alert">
              Your goals could not be saved. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
