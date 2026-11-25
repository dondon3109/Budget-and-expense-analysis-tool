import { useNetInfo } from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { checkInPet, getPet } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { usePetStore } from "@/stores/pet-store";

const ACTIVITY_REFRESH_DELAY_MS = 1_100;
let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancels any pending post-activity pet refresh, e.g. on sign-out or identity switch. */
export function cancelPendingPetRefresh(): void {
  if (pendingRefreshTimer !== null) {
    clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = null;
  }
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
    void getAccessToken(false)
      .then((accessToken) => getPet({ accessToken }))
      .then((pet) => {
        if (usePetStore.getState().pet !== null) {
          usePetStore.getState().setPet(pet);
        }
      })
      .catch(() => undefined);
  }, ACTIVITY_REFRESH_DELAY_MS);
}

/**
 * Checks in with the pet when a signed-in session starts, when connectivity returns after an
 * offline start, and each time the app returns to the foreground, so a day the app was opened
 * always counts toward the egg streak and daily points.
 */
export function usePetSync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const netInfo = useNetInfo();
  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;
  const checkInRef = useRef<(() => Promise<void>) | null>(null);
  const wasOfflineRef = useRef(offline);

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) {
      checkInRef.current = null;
      return;
    }
    const controller = new AbortController();
    let sawBackground = false;
    let inFlight = false;
    const checkIn = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const accessToken = await getAccessToken(false);
        if (controller.signal.aborted) return;
        const pet = await checkInPet({ accessToken, signal: controller.signal });
        if (controller.signal.aborted) return;
        usePetStore.getState().setPet(pet);
      } catch {
        // Offline or unreachable: the next foreground or reconnect tries again.
      } finally {
        inFlight = false;
      }
    };
    checkInRef.current = checkIn;
    if (!offline) void checkIn();
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
    return () => {
      checkInRef.current = null;
      subscription.remove();
      controller.abort();
    };
  }, [getAccessToken, status, subject]);

  useEffect(() => {
    const cameOnline = wasOfflineRef.current && !offline;
    wasOfflineRef.current = offline;
    if (cameOnline || (!offline && usePetStore.getState().pet === null)) {
      void checkInRef.current?.();
    }
  }, [offline]);
}
