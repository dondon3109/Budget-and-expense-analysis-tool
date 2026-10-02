import { useEffect } from "react";

import { getGoalProfile } from "@/api/goal-profile";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { useSessionSnapshot } from "./session-state";

/** Reads the workspace goal once per signed-in subject. A failed read keeps today's defaults. */
export function useGoalProfileSync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const profile = await getGoalProfile({ accessToken, signal: controller.signal });
        useGoalProfileStore.getState().setProfile(profile);
      } catch {
        // Offline or unreachable: no goal is known, so the default experience stays.
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, status, subject]);
}
