import { useEffect } from "react";

import { getGoalsProfile, getMoneyPreferences } from "@/api/goal-profile";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { useSessionSnapshot } from "./session-state";

/**
 * Reads the workspace goal and money habits once per signed-in subject. Each read fails on its
 * own and keeps today's defaults.
 */
export function useGoalProfileSync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const api = { accessToken, signal: controller.signal };
        const [profile, preferences] = await Promise.allSettled([
          getGoalsProfile(api),
          getMoneyPreferences(api),
        ]);
        if (profile.status === "fulfilled")
          useGoalProfileStore.getState().setProfile(profile.value);
        if (preferences.status === "fulfilled") {
          useGoalProfileStore.getState().setPreferences(preferences.value);
        }
      } catch {
        // Offline or unreachable: no goal is known, so the default experience stays.
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, status, subject]);
}
