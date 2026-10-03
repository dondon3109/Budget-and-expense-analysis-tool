import { useState } from "react";

import { saveGoals, skipGoal } from "@/api/goal-profile";
import { useSessionSnapshot } from "@/auth/session-state";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import type { PrimaryGoal } from "@zoption/shared";

/** `goals` is in the order they were picked; the first is the lead goal. */
export type GoalChoice = { goals: PrimaryGoal[]; otherText?: string };

/**
 * Saves or skips the goals on the Worker. Both need a connection; a failure leaves the stored
 * profile as it was and returns false with a message, so the screen stays usable and Skip still works.
 */
export function useGoalActions() {
  const session = useSessionSnapshot();
  const setProfile = useGoalProfileStore((state) => state.setProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    request: (api: { accessToken: string }) => Promise<void>,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await request({ accessToken: await session.getAccessToken(false) });
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your goals could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    save: (choice: GoalChoice) => run(async (api) => setProfile(await saveGoals(api, choice))),
    skip: () =>
      run(async (api) => {
        // Skip answers in the single-goal shape; a skipper has no goals.
        const { goal, otherText, selectedAt, skipped } = await skipGoal(api);
        setProfile({ goals: goal ? [goal] : [], otherText, selectedAt, skipped });
      }),
  };
}
