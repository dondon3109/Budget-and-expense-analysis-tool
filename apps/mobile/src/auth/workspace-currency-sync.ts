import { useEffect } from "react";
import { AppState } from "react-native";

import { getWorkspaceSettings } from "@/api/workspace-settings";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import { useSessionSnapshot } from "./session-state";

/**
 * Refreshes the cached currency of the workspace shown (personal or a family) from the Worker
 * once per signed-in subject and switch, and again whenever the app returns to the foreground. A failed read keeps the last known value; the demo session stays PHP.
 */
export function useWorkspaceCurrencySync(): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const workspaceId = useActiveWorkspace().family?.id ?? null;

  useEffect(() => {
    if (status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject)) return;
    let controller = new AbortController();
    const refresh = async (signal: AbortSignal): Promise<void> => {
      try {
        const accessToken = await getAccessToken(false);
        const settings = await getWorkspaceSettings({ accessToken, workspaceId, signal });
        useWorkspaceCurrencyStore.getState().setCurrency(settings.currency);
      } catch {
        // Offline or unreachable: keep the cached currency.
      }
    };
    void refresh(controller.signal);
    // The setting can change on another device, so re-read it when the app returns.
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      controller.abort();
      controller = new AbortController();
      void refresh(controller.signal);
    });
    return () => {
      appState.remove();
      controller.abort();
    };
  }, [getAccessToken, status, subject, workspaceId]);
}
