import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { GoalsProfile, MoneyPreferences } from "@zoption/shared";
import { useEffect } from "react";

import { ApiTransportError } from "@/api/authenticated";
import { getGoalsProfile, getMoneyPreferences } from "@/api/goal-profile";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { useSessionSnapshot } from "./session-state";

let loadedSubject: string | null = null;
let inFlightProfile: { subject: string; token: object; promise: Promise<GoalsProfile> } | null =
  null;
let inFlightPreferences: {
  subject: string;
  token: object;
  promise: Promise<MoneyPreferences>;
} | null = null;

function ensureSubject(subject: string): void {
  if (loadedSubject === subject) return;
  loadedSubject = subject;
  inFlightProfile = null;
  inFlightPreferences = null;
}

function clearGoalProfileInFlight(): void {
  loadedSubject = null;
  inFlightProfile = null;
  inFlightPreferences = null;
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
): Promise<T> {
  const accessToken = await getAccessToken(false);
  try {
    return await run(accessToken);
  } catch (error) {
    if (!(error instanceof ApiTransportError) || error.code !== "session_expired") {
      throw error;
    }
    const freshToken = await getAccessToken(true);
    return run(freshToken);
  }
}

/**
 * Loads the signed-in user's goal profile once per subject and shares any in-flight
 * request across `useGoalProfileSync` and `useOnboardingPrompt`.
 */
export function loadGoalProfileOnce(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<GoalsProfile> {
  ensureSubject(subject);
  const existing = useGoalProfileStore.getState().profile;
  if (existing) return Promise.resolve(existing);
  if (inFlightProfile && inFlightProfile.subject === subject) {
    return inFlightProfile.promise;
  }
  const token = {};
  const promise = withTokenRetry(getAccessToken, (accessToken) => getGoalsProfile({ accessToken }))
    .then((profile) => {
      if (inFlightProfile?.token === token && loadedSubject === subject) {
        useGoalProfileStore.getState().setProfile(profile);
      }
      return profile;
    })
    .finally(() => {
      if (inFlightProfile?.token === token) inFlightProfile = null;
    });
  inFlightProfile = { subject, token, promise };
  return promise;
}

/**
 * Loads the signed-in user's money preferences once per subject and shares any
 * in-flight request across `useGoalProfileSync` and `useOnboardingPrompt`.
 */
export function loadMoneyPreferencesOnce(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<MoneyPreferences> {
  ensureSubject(subject);
  const existing = useGoalProfileStore.getState().preferences;
  if (existing) return Promise.resolve(existing);
  if (inFlightPreferences && inFlightPreferences.subject === subject) {
    return inFlightPreferences.promise;
  }
  const token = {};
  const promise = withTokenRetry(getAccessToken, (accessToken) =>
    getMoneyPreferences({ accessToken }),
  )
    .then((preferences) => {
      if (inFlightPreferences?.token === token && loadedSubject === subject) {
        useGoalProfileStore.getState().setPreferences(preferences);
      }
      return preferences;
    })
    .finally(() => {
      if (inFlightPreferences?.token === token) inFlightPreferences = null;
    });
  inFlightPreferences = { subject, token, promise };
  return promise;
}

/**
 * Reads the workspace goal and money habits once per signed-in subject, retrying when
 * connectivity recovers after a failed fetch. Each read fails on its own and keeps today's
 * defaults.
 */
export function useGoalProfileSync(enabled = true): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject) {
      clearGoalProfileInFlight();
      return;
    }
    if (!enabled || isDummyDevelopmentSubject(subject)) return;
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
      try {
        const [profile, preferences] = await Promise.allSettled([
          loadGoalProfileOnce(subject, getAccessToken),
          loadMoneyPreferencesOnce(subject, getAccessToken),
        ]);
        if (!active) return;
        const rejectedReasons: unknown[] = [];
        if (profile.status === "rejected") rejectedReasons.push(profile.reason);
        if (preferences.status === "rejected") rejectedReasons.push(preferences.reason);
        if (rejectedReasons.length > 0) {
          needsRetry = true;
          offlineFailure = rejectedReasons.some(isOfflineNetworkError);
        }
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
  }, [enabled, getAccessToken, status, subject]);
}
