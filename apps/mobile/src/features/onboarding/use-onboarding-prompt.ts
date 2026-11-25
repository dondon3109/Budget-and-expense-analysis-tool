import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { OnboardingState } from "@zoption/shared";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { dismissQuickStart, getOnboardingState, getQuickStartState } from "@/api/onboarding";
import { loadGoalProfileOnce, loadMoneyPreferencesOnce } from "@/auth/goal-profile-sync";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { quickStartDismissStorageKey } from "@/features/dashboard/QuickStartGuideCard";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useSyncState } from "@/sync/sync-state";

let loadedSubject: string | null = null;
let loadedGeneration: number | null = null;
let inFlightOnboarding: {
  subject: string;
  generation: number;
  token: object;
  promise: Promise<OnboardingState>;
} | null = null;
let inFlightQuickStart: {
  subject: string;
  generation: number;
  token: object;
  promise: Promise<boolean>;
} | null = null;

function ensureOnboardingSubject(subject: string, generation: number): void {
  if (loadedSubject === subject && loadedGeneration === generation) return;
  loadedSubject = subject;
  loadedGeneration = generation;
  inFlightOnboarding = null;
  inFlightQuickStart = null;
}

function clearOnboardingInFlight(): void {
  loadedSubject = null;
  loadedGeneration = null;
  inFlightOnboarding = null;
  inFlightQuickStart = null;
}

function isOfflineNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof ApiTransportError) {
    return error.code === "network" && error.status === 0;
  }
  return !(error instanceof DOMException && error.name === "AbortError");
}

async function withTokenRetry<T>(
  getAccessToken: (refresh: boolean) => Promise<string>,
  run: (accessToken: string) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const accessToken = await getAccessToken(false);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    return await run(accessToken);
  } catch (error) {
    if (
      signal?.aborted ||
      !(error instanceof ApiTransportError) ||
      error.code !== "session_expired"
    ) {
      throw error;
    }
    const freshToken = await getAccessToken(true);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return run(freshToken);
  }
}

function loadOnboardingStateOnce(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<OnboardingState> {
  const generation = useOnboardingStore.getState().sessionGeneration;
  ensureOnboardingSubject(subject, generation);
  const existing = useOnboardingStore.getState().state;
  if (existing) return Promise.resolve(existing);
  if (
    inFlightOnboarding &&
    inFlightOnboarding.subject === subject &&
    inFlightOnboarding.generation === generation
  ) {
    return inFlightOnboarding.promise;
  }
  const token = {};
  const promise = withTokenRetry(getAccessToken, (accessToken) =>
    getOnboardingState({ accessToken }),
  )
    .then((state) => {
      if (
        inFlightOnboarding?.token === token &&
        loadedSubject === subject &&
        useOnboardingStore.getState().sessionGeneration === generation
      ) {
        useOnboardingStore.getState().setState(state);
      }
      return state;
    })
    .finally(() => {
      if (inFlightOnboarding?.token === token) inFlightOnboarding = null;
    });
  inFlightOnboarding = { subject, generation, token, promise };
  return promise;
}

function loadQuickStartDismissedOnce(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<boolean> {
  const generation = useOnboardingStore.getState().sessionGeneration;
  ensureOnboardingSubject(subject, generation);
  const existing = useOnboardingStore.getState().quickStartDismissed;
  if (existing !== null) return Promise.resolve(existing);
  if (
    inFlightQuickStart &&
    inFlightQuickStart.subject === subject &&
    inFlightQuickStart.generation === generation
  ) {
    return inFlightQuickStart.promise;
  }
  const token = {};
  const promise = withTokenRetry(getAccessToken, async (accessToken) => {
    const quickStart = await getQuickStartState({ accessToken });
    if (quickStart.dismissed) return true;
    const localDismissed = await SecureStore.getItemAsync(
      quickStartDismissStorageKey(subject),
    ).catch(() => null);
    if (localDismissed === "true") {
      if (useOnboardingStore.getState().sessionGeneration === generation) {
        void dismissQuickStart({ accessToken }).catch(() => undefined);
      }
      return true;
    }
    return false;
  })
    .then((dismissed) => {
      if (
        inFlightQuickStart?.token === token &&
        loadedSubject === subject &&
        useOnboardingStore.getState().sessionGeneration === generation
      ) {
        const current = useOnboardingStore.getState().quickStartDismissed;
        useOnboardingStore.getState().setQuickStartDismissed(current === true || dismissed);
      }
      return dismissed;
    })
    .finally(() => {
      if (inFlightQuickStart?.token === token) inFlightQuickStart = null;
    });
  inFlightQuickStart = { subject, generation, token, promise };
  return promise;
}

/**
 * Opens first-run setup once per launch while the Worker says it is unfinished,
 * retrying when connectivity recovers after an offline failure. Reuses the goal
 * profile and money preferences loaders so `useGoalProfileSync` and onboarding
 * never issue duplicate requests, and waits for both before pushing the modal
 * so setup never freezes `askGoals` / `askPreferences` to false on a startup race.
 * Also reads Quick start guide state once per launch so dismissed or aged-out
 * accounts never flash the tutorial card.
 */
export function useOnboardingPrompt(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const { retry: retrySync } = useSyncState();
  const prompted = useOnboardingStore((state) => state.prompted);

  useEffect(() => {
    if (status !== "signed-in" || !subject) {
      clearOnboardingInFlight();
      return;
    }
    if (prompted || isDummyDevelopmentSubject(subject)) return;

    let active = true;
    let inFlight = false;
    let needsRetry = false;
    let offlineFailure = false;
    let wasReachable: boolean | null = null;
    let reconnectedWhileInFlight = false;

    const run = async (): Promise<void> => {
      if (inFlight || !active) return;
      inFlight = true;
      needsRetry = false;
      offlineFailure = false;
      reconnectedWhileInFlight = false;
      // Share a single initial token fetch and 401 refresh across the parallel onboarding and
      // quick-start requests in this attempt.
      let tokenPromise: Promise<string> | null = null;
      let refreshPromise: Promise<string> | null = null;
      const resolveToken = (refresh: boolean): Promise<string> => {
        if (refresh) {
          refreshPromise ??= getAccessToken(true);
          tokenPromise = refreshPromise;
          return refreshPromise;
        }
        tokenPromise ??= getAccessToken(false);
        return tokenPromise;
      };
      try {
        const [onboardingResult, quickStartResult] = await Promise.allSettled([
          loadOnboardingStateOnce(subject, resolveToken),
          loadQuickStartDismissedOnce(subject, resolveToken),
        ]);
        if (!active) return;
        const rejectedReasons: unknown[] = [];
        if (onboardingResult.status === "rejected") rejectedReasons.push(onboardingResult.reason);
        if (quickStartResult.status === "rejected") rejectedReasons.push(quickStartResult.reason);
        if (rejectedReasons.length > 0) {
          needsRetry = true;
          offlineFailure = rejectedReasons.some(isOfflineNetworkError);
        }
        if (onboardingResult.status !== "fulfilled") return;
        const state = onboardingResult.value;
        if (state.step === "complete") return;

        // Ensure goals and money preferences are settled in the store before opening setup.
        await Promise.allSettled([
          loadGoalProfileOnce(subject, getAccessToken),
          loadMoneyPreferencesOnce(subject, getAccessToken),
        ]);
        if (!active || useOnboardingStore.getState().prompted) return;

        useOnboardingStore.getState().markPrompted();
        router.push("/(app)/onboarding");
      } catch (error) {
        if (active) {
          needsRetry = true;
          offlineFailure = isOfflineNetworkError(error);
        }
        // Offline or unreachable: reconnect or the next launch offers setup again.
      } finally {
        if (active) {
          inFlight = false;
          if (needsRetry && reconnectedWhileInFlight) {
            reconnectedWhileInFlight = false;
            void run();
          }
        }
      }
    };

    void run();
    const netInfo =
      typeof NetInfo?.addEventListener === "function"
        ? NetInfo.addEventListener((state) => {
            const reachable = state.isInternetReachable ?? state.isConnected;
            if (reachable === null || reachable === undefined) return;
            const previous = wasReachable;
            wasReachable = Boolean(reachable);
            if (!reachable) return;
            if (inFlight) {
              if (previous === false || previous === null) {
                reconnectedWhileInFlight = true;
              }
              return;
            }
            if (!needsRetry) return;
            if (previous === false || (previous === null && offlineFailure)) {
              void run();
            }
          })
        : null;
    return () => {
      active = false;
      netInfo?.();
    };
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
      const generation = store.sessionGeneration;
      void (async () => {
        try {
          const latest = await withTokenRetry(
            getAccessToken,
            (accessToken) => getOnboardingState({ accessToken, signal }),
            signal,
          );
          if (
            signal.aborted ||
            useOnboardingStore.getState().open ||
            useOnboardingStore.getState().sessionGeneration !== generation
          ) {
            return;
          }
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
