import { router } from "expo-router";
import { useEffect } from "react";

import { getOnboardingState } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useOnboardingStore } from "@/stores/onboarding-store";

/**
 * Opens first-run setup once per launch while the Worker says it is unfinished. It never blocks:
 * the screen can be dismissed, an offline launch (state unknown) skips it, and a guest or the demo
 * workspace has no Worker state to read.
 */
export function useOnboardingPrompt(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const prompted = useOnboardingStore((state) => state.prompted);

  useEffect(() => {
    if (prompted || status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject))
      return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const state = await getOnboardingState({ accessToken, signal: controller.signal });
        useOnboardingStore.getState().setState(state);
        if (state.step === "complete") return;
        useOnboardingStore.getState().markPrompted();
        router.push("/(app)/onboarding");
      } catch {
        // Offline or unreachable: setup is offered again on the next launch.
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, prompted, status, subject]);
}
