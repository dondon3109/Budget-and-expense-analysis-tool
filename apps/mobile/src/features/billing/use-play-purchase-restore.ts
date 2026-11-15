import { useEffect } from "react";
import { AppState } from "react-native";

import { reportGooglePlayPurchase } from "@/api/billing";
import { clearPlanCache } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { isPlayDistribution } from "@/config/app-variant";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";

import { restorePlayPurchases, type ReportPlayPurchase } from "./google-play";

/**
 * Play build only: reports the Zoption subscriptions Google Play holds when a signed-in session
 * starts and on every return to the foreground, so a purchase interrupted before the Worker saw
 * it, or one still pending when it was bought, unlocks the plan without the buyer doing anything.
 */
export function usePlayPurchaseRestore(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (!isPlayDistribution()) return;
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    let running = false;
    const report: ReportPlayPurchase = async ({ plan, familyId, body }) => {
      const accessToken = await getAccessToken(false);
      return reportGooglePlayPurchase(
        familyId ? { accessToken, workspaceId: familyId } : { accessToken },
        plan,
        body,
      );
    };
    const restore = async () => {
      if (running) return;
      running = true;
      try {
        if (await restorePlayPurchases(report)) clearPlanCache();
      } catch {
        // Offline or Play unavailable: the next foreground tries again.
      } finally {
        running = false;
      }
    };
    void restore();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void restore();
    });
    return () => subscription.remove();
  }, [getAccessToken, status, subject]);
}
