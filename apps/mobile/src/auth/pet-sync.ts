import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { checkInPet, getPet } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { usePetStore } from "@/stores/pet-store";

const ACTIVITY_REFRESH_DELAY_MS = 1_100;
let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRefresh: AbortController | null = null;

/** Cancels any pending or in-flight post-activity pet refresh, e.g. on sign-out or identity switch. */
export function cancelPendingPetRefresh(): void {
  if (pendingRefreshTimer !== null) {
    clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = null;
  }
  pendingRefresh?.abort();
  pendingRefresh = null;
}

/**
 * Refreshes the pet after a personal sync or assistant turn so points, health, and local pet
 * notifications catch up without waiting for the next foreground. Waits past the Worker's 1-second
 * `creditedThrough` boundary (`datetime('now')`).
 */
export function refreshPetAfterActivity(
  getAccessToken: (refresh: boolean) => Promise<string>,
): void {
  if (!usePetStore.getState().pet) return;
  cancelPendingPetRefresh();
  pendingRefreshTimer = setTimeout(() => {
    pendingRefreshTimer = null;
    if (!usePetStore.getState().pet) return;
    const controller = new AbortController();
    pendingRefresh = controller;
    void getAccessToken(false)
      .then((accessToken) => getPet({ accessToken, signal: controller.signal }))
      .then((pet) => {
        if (!controller.signal.aborted && usePetStore.getState().pet !== null) {
          usePetStore.getState().setPet(pet);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (pendingRefresh === controller) pendingRefresh = null;
      });
  }, ACTIVITY_REFRESH_DELAY_MS);
}

function isOfflineNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof ApiTransportError) {
    return error.code === "network" && error.status === 0;
  }
  return !(error instanceof DOMException && error.name === "AbortError");
}

/**
 * Checks in with the pet when a signed-in session starts, when connectivity recovers
 * after an error, and each time the app returns to the foreground, so a day the app
 * was opened always counts toward the egg streak and daily points.
 */
export function usePetSync(enabled = true): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (!enabled || status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject))
      return;
    const controller = new AbortController();
    let sawBackground = false;
    let inFlight = false;
    let needsRetry = false;
    let offlineFailure = false;
    let wasReachable: boolean | null = null;
    let reconnectedWhileInFlight = false;

    const checkIn = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      needsRetry = false;
      offlineFailure = false;
      reconnectedWhileInFlight = false;
      try {
        let accessToken = await getAccessToken(false);
        if (controller.signal.aborted) return;
        let pet;
        try {
          pet = await checkInPet({ accessToken, signal: controller.signal });
        } catch (error) {
          if (!(error instanceof ApiTransportError) || error.code !== "session_expired") {
            throw error;
          }
          if (controller.signal.aborted) return;
          accessToken = await getAccessToken(true);
          if (controller.signal.aborted) return;
          pet = await checkInPet({ accessToken, signal: controller.signal });
        }
        if (controller.signal.aborted) return;
        usePetStore.getState().setPet(pet);
      } catch (error) {
        if (!controller.signal.aborted) {
          needsRetry = true;
          offlineFailure = isOfflineNetworkError(error);
        }
        // Offline or unreachable: reconnect or the next foreground tries again.
      } finally {
        inFlight = false;
        if (!controller.signal.aborted && needsRetry && reconnectedWhileInFlight) {
          reconnectedWhileInFlight = false;
          void checkIn();
        }
      }
    };
    void checkIn();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        sawBackground = true;
        return;
      }
      if (state === "active" && sawBackground) {
        sawBackground = false;
        void checkIn();
      }
    });
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
              void checkIn();
            }
          })
        : null;
    return () => {
      subscription.remove();
      netInfo?.();
      controller.abort();
    };
  }, [enabled, getAccessToken, status, subject]);
}
