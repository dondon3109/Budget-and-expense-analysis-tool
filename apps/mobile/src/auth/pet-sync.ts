import { useEffect } from "react";
import { AppState } from "react-native";

import { checkInPet } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { usePetStore } from "@/stores/pet-store";

/**
 * Checks in with the pet when a signed-in session starts and each time the app returns to the
 * foreground, so a day the app was opened always counts toward the egg streak and daily points.
 */
export function usePetSync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    const controller = new AbortController();
    const checkIn = async () => {
      try {
        const accessToken = await getAccessToken(false);
        usePetStore.getState().setPet(await checkInPet({ accessToken, signal: controller.signal }));
      } catch {
        // Offline or unreachable: the next foreground tries again.
      }
    };
    void checkIn();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkIn();
    });
    return () => {
      subscription.remove();
      controller.abort();
    };
  }, [getAccessToken, status, subject]);
}
