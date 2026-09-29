import { useEffect } from "react";

import { getWorkspaceSettings } from "@/api/workspace-settings";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import { useSessionSnapshot } from "./session-state";

/**
 * Refreshes the cached workspace currency from the Worker once per signed-in
 * subject. A failed read keeps the last known value; the demo session stays PHP.
 */
export function useWorkspaceCurrencySync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const settings = await getWorkspaceSettings({ accessToken, signal: controller.signal });
        useWorkspaceCurrencyStore.getState().setCurrency(settings.currency);
      } catch {
        // Offline or unreachable: keep the cached currency.
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, status, subject]);
}
