import { router } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";

import { getGoalsProfile, getMoneyPreferences } from "@/api/goal-profile";
import { getOnboardingState } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useSyncState } from "@/sync/sync-state";

/**
 * Opens first-run setup once per launch while the Worker says it is unfinished. Fetches the goal
 * profile and money preferences alongside onboarding state before pushing the modal so setup never
 * freezes `askGoals` / `askPreferences` to false on a startup race.
 */
export function useOnboardingPrompt(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const { retry: retrySync } = useSyncState();
  const prompted = useOnboardingStore((state) => state.prompted);

  useEffect(() => {
    if (prompted || status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject))
      return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const api = { accessToken, signal: controller.signal };
        const state = await getOnboardingState(api);
        if (controller.signal.aborted) return;
        useOnboardingStore.getState().setState(state);
        if (state.step === "complete") return;

        // Ensure goals and money preferences are settled in the store before opening setup.
        const goalStore = useGoalProfileStore.getState();
        const [profileResult, preferencesResult] = await Promise.allSettled([
          goalStore.profile ? Promise.resolve(goalStore.profile) : getGoalsProfile(api),
          goalStore.preferences ? Promise.resolve(goalStore.preferences) : getMoneyPreferences(api),
        ]);
        if (controller.signal.aborted) return;
        if (profileResult.status === "fulfilled") {
          useGoalProfileStore.getState().setProfile(profileResult.value);
        }
        if (preferencesResult.status === "fulfilled") {
          useGoalProfileStore.getState().setPreferences(preferencesResult.value);
        }

        useOnboardingStore.getState().markPrompted();
        router.push("/(app)/onboarding");
      } catch {
        // Offline or unreachable: setup is offered again on the next launch.
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, prompted, status, subject]);

  // If setup was finished on web or another device, clear the Resume setup card when returning.
  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    let controller = new AbortController();
    let sawBackground = false;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        sawBackground = true;
        return;
      }
      if (next !== "active" || !sawBackground) return;
      sawBackground = false;
      const store = useOnboardingStore.getState();
      if (store.open || store.state?.step === "complete") return;
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      void (async () => {
        try {
          const accessToken = await getAccessToken(false);
          if (signal.aborted) return;
          const latest = await getOnboardingState({ accessToken, signal });
          if (signal.aborted || useOnboardingStore.getState().open) return;
          useWorkspaceCurrencyStore.getState().setCurrency(latest.currency);
          useOnboardingStore.getState().setState(latest);
          if (latest.step === "complete") {
            retrySync();
          }
        } catch {
          // Offline or unreachable: keep the cached state until the next foreground or resume.
        }
      })();
    });
    return () => {
      subscription.remove();
      controller.abort();
    };
  }, [getAccessToken, retrySync, status, subject]);
}
