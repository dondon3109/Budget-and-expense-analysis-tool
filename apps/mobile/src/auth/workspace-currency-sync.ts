import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { getWorkspaceSettings } from "@/api/workspace-settings";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import { useSessionSnapshot } from "./session-state";

function isOfflineNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof ApiTransportError) {
    return error.code === "network" && error.status === 0;
  }
  return !(error instanceof DOMException && error.name === "AbortError");
}

/**
 * Refreshes the cached currency of the workspace shown (personal or a family) from the Worker
 * once per signed-in subject and switch, and again whenever the app returns to the foreground or
 * regains connectivity after an error. A failed read keeps the last known value; the demo session
 * stays PHP.
 */
export function useWorkspaceCurrencySync(enabled = true): void {
  const { subject, status, getAccessToken } = useSessionSnapshot();
  const workspaceId = useActiveWorkspace().family?.id ?? null;

  useEffect(() => {
    if (!enabled || status !== "signed-in" || !subject || isDummyDevelopmentSubject(subject))
      return;
    let controller = new AbortController();
    let sawBackground = false;
    let inFlight = false;
    let needsRetry = false;
    let offlineFailure = false;
    let wasReachable: boolean | null = null;
    let reconnectedWhileInFlight = false;

    const refresh = async (signal: AbortSignal): Promise<void> => {
      inFlight = true;
      needsRetry = false;
      offlineFailure = false;
      reconnectedWhileInFlight = false;
      try {
        let accessToken = await getAccessToken(false);
        if (signal.aborted) return;
        let settings;
        try {
          settings = await getWorkspaceSettings({ accessToken, workspaceId, signal });
        } catch (error) {
          if (!(error instanceof ApiTransportError) || error.code !== "session_expired") {
            throw error;
          }
          if (signal.aborted) return;
          accessToken = await getAccessToken(true);
          if (signal.aborted) return;
          settings = await getWorkspaceSettings({ accessToken, workspaceId, signal });
        }
        if (signal.aborted) return;
        useWorkspaceCurrencyStore.getState().setCurrency(settings.currency);
      } catch (error) {
        if (!signal.aborted) {
          needsRetry = true;
          offlineFailure = isOfflineNetworkError(error);
        }
        // Offline or unreachable: keep the cached currency.
      } finally {
        if (!signal.aborted) {
          inFlight = false;
          if (needsRetry && reconnectedWhileInFlight) {
            reconnectedWhileInFlight = false;
            controller = new AbortController();
            void refresh(controller.signal);
          }
        }
      }
    };
    void refresh(controller.signal);
    // The setting can change on another device, so re-read it when returning from background.
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        sawBackground = true;
        return;
      }
      if (next !== "active" || !sawBackground) return;
      sawBackground = false;
      controller.abort();
      controller = new AbortController();
      void refresh(controller.signal);
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
              controller.abort();
              controller = new AbortController();
              void refresh(controller.signal);
            }
          })
        : null;
    return () => {
      appState.remove();
      netInfo?.();
      controller.abort();
    };
  }, [enabled, getAccessToken, status, subject, workspaceId]);
}
