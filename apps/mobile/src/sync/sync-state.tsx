import { useNetInfo } from "@react-native-community/netinfo";
import type { MobileSyncPushRequest } from "@zoption/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  acknowledgeMobileSync,
  MobileSyncTransportError,
  pullMobileSync,
  pushMobileSync,
} from "@/api/mobile-sync";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { LocalSyncApplyError } from "@/db/sync-repository";

export type ForegroundSyncStatus =
  "waiting" | "syncing" | "synced" | "failed" | "full-resync-required";

interface SyncSnapshot {
  status: ForegroundSyncStatus;
  message: string | null;
  retry: () => void;
}

interface SyncProviderProps extends PropsWithChildren {
  enabled?: boolean;
  unavailableMessage?: string | null;
  onUnavailableRetry?: () => void;
}

const SyncContext = createContext<SyncSnapshot>({
  status: "waiting",
  message: null,
  retry: () => undefined,
});

async function pullWithTimeout(
  accessToken: string,
  cursor: string | null,
  parentSignal: AbortSignal,
) {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  parentSignal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 30_000);
  try {
    return await pullMobileSync({ accessToken, cursor, signal: controller.signal });
  } catch (error) {
    if (timedOut && error instanceof Error && error.name === "AbortError") {
      throw new MobileSyncTransportError(
        "Zoption did not respond before synchronization timed out.",
        "retryable",
        0,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abort);
  }
}

async function pushWithTimeout(
  accessToken: string,
  request: MobileSyncPushRequest,
  parentSignal: AbortSignal,
) {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  parentSignal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 30_000);
  try {
    return await pushMobileSync({ accessToken, request, signal: controller.signal });
  } catch (error) {
    if (timedOut && error instanceof Error && error.name === "AbortError") {
      throw new MobileSyncTransportError(
        "Zoption did not respond before synchronization timed out.",
        "retryable",
        0,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abort);
  }
}

async function acknowledgeWithTimeout(
  accessToken: string,
  clientId: string,
  cursor: string,
  parentSignal: AbortSignal,
) {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  parentSignal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 30_000);
  try {
    return await acknowledgeMobileSync({
      accessToken,
      clientId,
      cursor,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut && error instanceof Error && error.name === "AbortError") {
      throw new MobileSyncTransportError(
        "Zoption did not confirm synchronization progress before timing out.",
        "retryable",
        0,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abort);
  }
}

export function SyncProvider({
  children,
  enabled = true,
  unavailableMessage = null,
  onUnavailableRetry,
}: SyncProviderProps) {
  const { workspace } = useLocalWorkspace();
  const session = useSessionSnapshot();
  const netInfo = useNetInfo();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<SyncSnapshot, "retry">>({
    status: "waiting",
    message: null,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!workspace || session.status !== "signed-in") return;
    if (!enabled) {
      setSnapshot({
        status: unavailableMessage ? "failed" : "waiting",
        message: unavailableMessage,
      });
      return;
    }
    if (reachable === false) {
      setSnapshot({
        status: "waiting",
        message: "Offline. Showing records already protected on this device.",
      });
      return;
    }

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleOutstandingRetry = async () => {
      const schedule = await workspace.transactionMutations.getPushSchedule();
      if (
        schedule.nextAttemptAt &&
        requestRef.current === requestId &&
        !controller.signal.aborted
      ) {
        const delay = Math.max(250, Date.parse(schedule.nextAttemptAt) - Date.now());
        retryTimer = setTimeout(() => setAttempt((value) => value + 1), delay);
      }
      return schedule;
    };
    setSnapshot({ status: "syncing", message: null });
    const run = async (): Promise<void> => {
      try {
        let accessToken = await session.getAccessToken(false);
        let refreshed = false;
        for (let batchNumber = 0; batchNumber < 100; batchNumber += 1) {
          const request = await workspace.transactionMutations.getPushBatch();
          if (!request) break;
          let response;
          try {
            response = await pushWithTimeout(accessToken, request, controller.signal);
          } catch (error) {
            if (
              error instanceof MobileSyncTransportError &&
              error.code === "session_expired" &&
              !refreshed
            ) {
              accessToken = await session.getAccessToken(true);
              refreshed = true;
              batchNumber -= 1;
              continue;
            }
            if (
              error instanceof MobileSyncTransportError &&
              (error.code === "permanent_rejection" || error.code === "idempotency_mismatch")
            ) {
              await workspace.transactionMutations.recordPushPermanentFailure(request, error.code);
            } else if (
              error instanceof MobileSyncTransportError &&
              error.code !== "account_deleted" &&
              error.code !== "session_expired"
            ) {
              await workspace.transactionMutations.recordPushFailure(
                request,
                error.code,
                error.retryAfterSeconds,
              );
            }
            throw error;
          }
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          await workspace.transactionMutations.applyPushResponse(request, response);
          if (batchNumber === 99) {
            throw new Error("Synchronization exceeded the safe foreground push limit.");
          }
        }
        for (let pageNumber = 0; pageNumber < 250; pageNumber += 1) {
          const cursor = await workspace.syncRepository.getCursor();
          let page;
          try {
            page = await pullWithTimeout(accessToken, cursor, controller.signal);
          } catch (error) {
            if (
              error instanceof MobileSyncTransportError &&
              error.code === "session_expired" &&
              !refreshed
            ) {
              accessToken = await session.getAccessToken(true);
              refreshed = true;
              pageNumber -= 1;
              continue;
            }
            throw error;
          }
          if (page.hasMore && page.nextCursor === (cursor ?? "v1.0")) {
            throw new Error("Synchronization did not make cursor progress.");
          }
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          try {
            await workspace.syncRepository.applyPullPage(cursor, page);
          } catch (error) {
            if (error instanceof LocalSyncApplyError && error.code === "cursor_mismatch") {
              // Connectivity and identity signals can start a newer pull while an
              // older page is committing. Re-read the durable cursor and fetch
              // again instead of presenting that harmless local race as failure.
              continue;
            }
            throw error;
          }
          if (!page.hasMore) {
            const clientId = await workspace.transactionMutations.clientId();
            let acknowledgement;
            try {
              acknowledgement = await acknowledgeWithTimeout(
                accessToken,
                clientId,
                page.nextCursor,
                controller.signal,
              );
            } catch (error) {
              if (
                error instanceof MobileSyncTransportError &&
                error.code === "session_expired" &&
                !refreshed
              ) {
                accessToken = await session.getAccessToken(true);
                refreshed = true;
                acknowledgement = await acknowledgeWithTimeout(
                  accessToken,
                  clientId,
                  page.nextCursor,
                  controller.signal,
                );
              } else {
                throw error;
              }
            }
            await workspace.syncRepository.recordAcknowledgement(
              acknowledgement.acknowledgedCursor,
              acknowledgement.retentionFloorCursor,
            );
            if (requestRef.current === requestId) {
              const schedule = await scheduleOutstandingRetry();
              if (requestRef.current === requestId && !controller.signal.aborted) {
                setSnapshot({
                  status:
                    schedule.blockedCount > 0
                      ? "failed"
                      : schedule.outstandingCount > 0
                        ? "waiting"
                        : "synced",
                  message:
                    schedule.blockedCount > 0
                      ? "Some saved changes need review before synchronization can finish."
                      : null,
                });
              }
            }
            return;
          }
        }
        throw new Error("Synchronization exceeded the safe foreground page limit.");
      } catch (error) {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        await workspace.syncRepository.recordFailure().catch(() => undefined);
        if (error instanceof MobileSyncTransportError && error.code === "account_deleted") {
          await session.signOut({ preserveLocalWorkspace: true }).catch(() => undefined);
          return;
        }
        if (error instanceof MobileSyncTransportError && error.code === "full_resync_required") {
          setSnapshot({
            status: "full-resync-required",
            message:
              "This local copy needs recovery before it can accept more server changes. Existing local data was preserved.",
          });
          return;
        }
        if (
          error instanceof MobileSyncTransportError &&
          error.code !== "session_expired" &&
          error.code !== "permanent_rejection" &&
          error.code !== "idempotency_mismatch"
        ) {
          await scheduleOutstandingRetry().catch(() => undefined);
        }
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setSnapshot({
          status: "failed",
          message:
            error instanceof MobileSyncTransportError
              ? error.message
              : error instanceof LocalSyncApplyError
                ? error.message
                : __DEV__ && error instanceof Error
                  ? `Synchronization stopped safely. ${error.message}`
                  : "Synchronization stopped safely. Records already stored on this device are unchanged.",
        });
      }
    };

    void run();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [attempt, enabled, reachable, session, unavailableMessage, workspace]);

  const retry = useCallback(() => {
    if (!enabled) {
      onUnavailableRetry?.();
      return;
    }
    setAttempt((value) => value + 1);
  }, [enabled, onUnavailableRetry]);
  const value = useMemo(() => ({ ...snapshot, retry }), [retry, snapshot]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncState(): SyncSnapshot {
  return useContext(SyncContext);
}
