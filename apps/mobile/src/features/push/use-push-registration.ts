import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";

import { pushProjectId, registerForPush } from "./push-registration";

function isOfflineNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof ApiTransportError) {
    return error.code === "network" && error.status === 0;
  }
  return !(error instanceof DOMException && error.name === "AbortError");
}

/**
 * Registers on sign-in, when connectivity recovers after an error, and on every
 * return to the foreground, which catches a new grant.
 */
export function usePushRegistration(enabled = true): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (!enabled || status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject))
      return;
    if (!pushProjectId()) return;
    let active = true;
    let sawBackground = false;
    let inFlight = false;
    let needsRetry = false;
    let offlineFailure = false;
    let wasReachable: boolean | null = null;
    let reconnectedWhileInFlight = false;

    const register = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      needsRetry = false;
      offlineFailure = false;
      reconnectedWhileInFlight = false;
      try {
        let token = await getAccessToken(false);
        if (!active) return;
        try {
          await registerForPush(token);
        } catch (error) {
          if (!(error instanceof ApiTransportError) || error.code !== "session_expired") {
            throw error;
          }
          if (!active) return;
          token = await getAccessToken(true);
          if (!active) return;
          await registerForPush(token);
        }
      } catch (error) {
        if (active) {
          needsRetry = true;
          offlineFailure = isOfflineNetworkError(error);
        }
        // Offline or Firebase unavailable: reconnect or the next foreground tries again.
      } finally {
        if (active) {
          inFlight = false;
          if (needsRetry && reconnectedWhileInFlight) {
            reconnectedWhileInFlight = false;
            void register();
          }
        }
      }
    };
    void register();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        sawBackground = true;
        return;
      }
      if (state === "active" && sawBackground) {
        sawBackground = false;
        void register();
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
              void register();
            }
          })
        : null;
    // FCM can rotate the device token while the app runs.
    const tokenChange = Notifications.addPushTokenListener(() => void register());
    return () => {
      active = false;
      appState.remove();
      netInfo?.();
      tokenChange.remove();
    };
  }, [enabled, getAccessToken, status, subject]);
}
