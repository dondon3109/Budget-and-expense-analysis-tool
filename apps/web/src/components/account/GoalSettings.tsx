import { primaryGoalLabels } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import {
  useGoalProfile,
  useMoneyPreferences,
  useSaveGoals,
  useSaveMoneyPreferences,
} from "../../queries/goalProfile";
import { GoalPicker } from "../onboarding/GoalPicker";
import { PreferencesPicker } from "../onboarding/PreferencesPicker";

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
      <MoneyPreferencesSettings workspace={workspace} />
    </section>
  );
}

/** Pay cadence, budgeting style, and spending focus, which tailor suggestions and the AI. */
function MoneyPreferencesSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const preferencesQuery = useMoneyPreferences(workspace);
  const save = useSaveMoneyPreferences(workspace);

  if (preferencesQuery.isPending) {
    return (
      <p className="settings-helper" role="status">
        Loading your money habits…
      </p>
    );
  }
  if (!preferencesQuery.data) {
    return (
      <p className="form-error" role="alert">
        Your money habits could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  return (
    <div className="settings-form">
      <h3>Your money habits</h3>
      <p className="settings-helper">
        Zoption uses these to suggest next steps on your dashboard and to tailor the AI.
      </p>
      <PreferencesPicker
        preferences={preferencesQuery.data}
        disabled={save.isPending}
        confirmLabel="Save money habits"
        onSave={(preferences) => save.mutate(preferences)}
      />
      {save.isSuccess && (
        <p className="settings-helper" role="status">
          Saved. Your suggestions are updated.
        </p>
      )}
      {save.isError && (
        <p className="form-error" role="alert">
          Your money habits could not be saved. Try again.
        </p>
      )}
    </div>
  );
}
