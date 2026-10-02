import { primaryGoalLabels } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useGoalProfile, useSaveGoal } from "../../queries/goalProfile";
import { GoalPicker } from "../onboarding/GoalPicker";

export function GoalSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const profileQuery = useGoalProfile(workspace);
  const saveGoal = useSaveGoal(workspace);
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
          <h2 id="primary-goal-title">Your goal</h2>
          <p>What you mainly want Zoption for. You can change it any time.</p>
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
            {profile.goal
              ? `Current goal: ${primaryGoalLabels[profile.goal]}${
                  profile.goal === "other" && profile.otherText ? ` (${profile.otherText})` : ""
                }`
              : "Not set. Choose what fits you best, whenever you like."}
          </p>
          <GoalPicker
            legend="Change your goal"
            goal={profile.goal}
            otherText={profile.otherText}
            disabled={saveGoal.isPending}
            confirmLabel="Save goal"
            onChoose={(choice) => saveGoal.mutate(choice)}
          />
          {saveGoal.isError && (
            <p className="form-error" role="alert">
              Your goal could not be saved. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
