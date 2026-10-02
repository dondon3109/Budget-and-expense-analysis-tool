import { useState } from "react";

import { saveGoal, skipGoal } from "@/api/goal-profile";
import { useSessionSnapshot } from "@/auth/session-state";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import type { PrimaryGoal } from "@zoption/shared";

export type GoalChoice = { goal: PrimaryGoal; otherText?: string };

/**
 * Saves or skips the goal on the Worker. Both need a connection; a failure leaves the stored
 * profile as it was and returns false with a message, so the screen stays usable and Skip still works.
 */
export function useGoalActions() {
  const session = useSessionSnapshot();
  const setProfile = useGoalProfileStore((state) => state.setProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    request: (api: { accessToken: string }) => ReturnType<typeof skipGoal>,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      setProfile(await request({ accessToken: await session.getAccessToken(false) }));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your goal could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    save: (choice: GoalChoice) => run((api) => saveGoal(api, choice)),
    skip: () => run(skipGoal),
  };
}
