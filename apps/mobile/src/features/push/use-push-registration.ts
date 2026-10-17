import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";

import { pushProjectId, registerForPush } from "./push-registration";

/** Registers on sign-in and on every return to the foreground, which catches a new grant. */
export function usePushRegistration(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    if (!pushProjectId()) return;
    const register = async () => {
      try {
        await registerForPush(await getAccessToken(false));
      } catch {
        // Offline or Firebase unavailable: the next foreground tries again.
      }
    };
    void register();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void register();
    });
    // FCM can rotate the device token while the app runs.
    const tokenChange = Notifications.addPushTokenListener(() => void register());
    return () => {
      appState.remove();
      tokenChange.remove();
    };
  }, [getAccessToken, status, subject]);
}
