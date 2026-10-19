import { setBackgroundSyncRunner } from "./background-sync-task";
import { useNetInfo } from "@react-native-community/netinfo";
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

import { Alert } from "react-native";

import {
  acknowledgeMobileSync,
  MobileSyncTransportError,
  pullMobileSync,
  pushMobileSync,
  type WorkspaceAccessCode,
} from "@/api/mobile-sync";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { LocalSyncApplyError } from "@/db/sync-repository";
import { reportPlanLimit } from "@/features/billing/PlanLimitDialog";
import { recoverLocalWorkspace, withDetachedWorkspace, type LocalWorkspace } from "@/db/workspace";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { describeRefusedChanges } from "@/features/family/refused-changes";
import { familySubject } from "@/features/family/workspace-record";

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

/**
 * Delay before a launch's first push and pull. The sync work itself is
 * unchanged: this only keeps it from competing with the first screen's read
 * for the JS thread and the serialized local writer.
 */
const INITIAL_SYNC_DELAY_MS = 400;

/**
 * Runs one sync request with its own 30 second ceiling, aborted with the run. A timeout reads
 * as a retryable failure; the run's own abort propagates untouched.
 */
async function withTimeout<T>(
  parentSignal: AbortSignal,
  timeoutMessage: string,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  parentSignal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 30_000);
  try {
    return await call(controller.signal);
  } catch (error) {
    if (timedOut && error instanceof Error && error.name === "AbortError") {
      throw new MobileSyncTransportError(timeoutMessage, "retryable", 0);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abort);
  }
}

const TIMED_OUT = "Zoption did not respond before synchronization timed out.";

/** The run's access token, refreshed at most once when the Worker says it expired. */
interface SyncAuth {
  token: string;
  refreshed: boolean;
  getAccessToken: (forceRefresh: boolean) => Promise<string>;
}

async function withSessionRetry<T>(auth: SyncAuth, call: (token: string) => Promise<T>) {
  try {
    return await call(auth.token);
  } catch (error) {
    if (
      !(error instanceof MobileSyncTransportError) ||
      error.code !== "session_expired" ||
      auth.refreshed
    ) {
      throw error;
    }
    auth.token = await auth.getAccessToken(true);
    auth.refreshed = true;
    return call(auth.token);
  }
}

function isWorkspaceRefusal(error: unknown): error is MobileSyncTransportError & {
  code: WorkspaceAccessCode;
} {
  return (
    error instanceof MobileSyncTransportError &&
    (error.code === "workspace_forbidden" ||
      error.code === "workspace_read_only" ||
      error.code === "workspace_closing")
  );
}

/**
 * Uploads a workspace's outbox in batches into the workspace `workspaceId` names (personal when
 * null). Returns false once `stale` says a newer run took over.
 */
async function pushOutbox(
  workspace: LocalWorkspace,
  workspaceId: string | null,
  auth: SyncAuth,
  signal: AbortSignal,
  stale: () => boolean,
): Promise<boolean> {
  for (let batchNumber = 0; batchNumber < 100; batchNumber += 1) {
    const request = await workspace.transactionMutations.getPushBatch();
    if (!request) return true;
    let response;
    try {
      response = await withSessionRetry(auth, (accessToken) =>
        withTimeout(signal, TIMED_OUT, (timeoutSignal) =>
          pushMobileSync({ accessToken, workspaceId, request, signal: timeoutSignal }),
        ),
      );
    } catch (error) {
      if (
        error instanceof MobileSyncTransportError &&
        (error.code === "permanent_rejection" || error.code === "idempotency_mismatch")
      ) {
        await workspace.transactionMutations.recordPushPermanentFailure(request, error.code);
      } else if (
        error instanceof MobileSyncTransportError &&
        error.code !== "account_deleted" &&
        error.code !== "session_expired" &&
        // The family's copy is settled by the caller, which drops these changes.
        !isWorkspaceRefusal(error)
      ) {
        await workspace.transactionMutations.recordPushFailure(
          request,
          error.code,
          error.retryAfterSeconds,
        );
      }
      throw error;
    }
    if (stale()) return false;
    await workspace.transactionMutations.applyPushResponse(request, response);
    const limit = response.results.find(
      (result) => result.status === "rejected" && result.code === "plan_limit",
    );
    if (limit?.status === "rejected") reportPlanLimit(limit.message);
  }
  throw new Error("Synchronization exceeded the safe foreground push limit.");
}

/** A workspace other than the shown one whose pending changes still need uploading. */
interface DrainTarget {
  subject: string;
  workspaceId: string | null;
}

export function SyncProvider({
  children,
  enabled = true,
  unavailableMessage = null,
  onUnavailableRetry,
}: SyncProviderProps) {
  const { workspace, reopen } = useLocalWorkspace();
  const session = useSessionSnapshot();
  const active = useActiveWorkspace();
  const { markSynced, forgetFamily, refresh: refreshFamilies, workspaceSubject } = active;
  const familyId = active.family?.id ?? null;
  const familyName = active.family?.name ?? null;
  const netInfo = useNetInfo();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<SyncSnapshot, "retry">>({
    status: "waiting",
    message: null,
  });
  const requestRef = useRef(0);

  // Every other workspace on this phone that may hold changes made before a switch. They upload
  // after the shown one syncs, once per launch, switch, or background run, never pulling.
  const drainTargets = useMemo<DrainTarget[]>(() => {
    if (!session.subject) return [];
    const subject = session.subject;
    const families = active.synced
      .filter((id) => id !== familyId && active.families.some((family) => family.id === id))
      .map((id) => ({ subject: familySubject(subject, id), workspaceId: id }));
    return familyId ? [{ subject, workspaceId: null }, ...families] : families;
  }, [active.families, active.synced, familyId, session.subject]);
  const drainTargetsRef = useRef(drainTargets);
  const drainRequestedRef = useRef(true);
  useEffect(() => {
    drainTargetsRef.current = drainTargets;
  }, [drainTargets]);
  useEffect(() => {
    drainRequestedRef.current = true;
  }, [workspaceSubject]);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!workspace || session.status !== "signed-in") return;
    if (isDummyDevelopmentSubject(session.subject)) {
      setSnapshot({
        status: "synced",
        message: null,
      });
      return;
    }
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
    const stale = () => requestRef.current !== requestId || controller.signal.aborted;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleOutstandingRetry = async () => {
      const schedule = await workspace.transactionMutations.getPushSchedule();
      if (schedule.nextAttemptAt && !stale()) {
        const delay = Math.max(250, Date.parse(schedule.nextAttemptAt) - Date.now());
        retryTimer = setTimeout(() => setAttempt((value) => value + 1), delay);
      }
      return schedule;
    };
    const drainOtherWorkspaces = async (auth: SyncAuth) => {
      if (!drainRequestedRef.current) return;
      drainRequestedRef.current = false;
      for (const target of drainTargetsRef.current) {
        if (stale()) return;
        try {
          await withDetachedWorkspace(target.subject, (other) =>
            pushOutbox(other, target.workspaceId, auth, controller.signal, stale),
          );
        } catch (error) {
          // Each stays queued for its own next sync; only a lost membership is settled here.
          if (target.workspaceId && isWorkspaceRefusal(error)) {
            if (error.code === "workspace_forbidden") await forgetFamily(target.workspaceId);
          }
        }
      }
    };
    setSnapshot({ status: "syncing", message: null });
    const run = async (): Promise<void> => {
      if (controller.signal.aborted) return;
      try {
        const auth: SyncAuth = {
          token: await session.getAccessToken(false),
          refreshed: false,
          getAccessToken: session.getAccessToken,
        };
        if (!(await pushOutbox(workspace, familyId, auth, controller.signal, stale))) return;
        for (let pageNumber = 0; pageNumber < 250; pageNumber += 1) {
          const cursor = await workspace.syncRepository.getCursor();
          const page = await withSessionRetry(auth, (accessToken) =>
            withTimeout(controller.signal, TIMED_OUT, (signal) =>
              pullMobileSync({ accessToken, workspaceId: familyId, cursor, signal }),
            ),
          );
          if (page.hasMore && page.nextCursor === (cursor ?? "v1.0")) {
            throw new Error("Synchronization did not make cursor progress.");
          }
          if (stale()) return;
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
            const acknowledgement = await withSessionRetry(auth, (accessToken) =>
              withTimeout(
                controller.signal,
                "Zoption did not confirm synchronization progress before timing out.",
                (signal) =>
                  acknowledgeMobileSync({
                    accessToken,
                    workspaceId: familyId,
                    clientId,
                    cursor: page.nextCursor,
                    signal,
                  }),
              ),
            );
            await workspace.syncRepository.recordAcknowledgement(
              acknowledgement.acknowledgedCursor,
              acknowledgement.retentionFloorCursor,
            );
            // From here the family opens offline (the switcher allows it).
            if (familyId) markSynced(familyId);
            if (requestRef.current === requestId) {
              const schedule = await scheduleOutstandingRetry();
              if (!stale()) {
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
            await drainOtherWorkspaces(auth);
            return;
          }
        }
        throw new Error("Synchronization exceeded the safe foreground page limit.");
      } catch (error) {
        if (stale()) return;
        await workspace.syncRepository.recordFailure().catch(() => undefined);
        if (error instanceof MobileSyncTransportError && error.code === "account_deleted") {
          await session.signOut({ preserveLocalWorkspace: true }).catch(() => undefined);
          return;
        }
        if (familyId && isWorkspaceRefusal(error)) {
          // The family no longer takes this person's changes: say what is dropped, then
          // delete the copy (removed) or rebuild it from the family's records (viewer, closing).
          const pending = await workspace.syncRepository.pendingEntityCounts().catch(() => ({}));
          const notice = describeRefusedChanges(error.code, familyName ?? "This family", pending);
          Alert.alert(notice.title, notice.message);
          refreshFamilies();
          if (error.code === "workspace_forbidden") {
            await forgetFamily(familyId);
            return;
          }
          try {
            await recoverLocalWorkspace(
              workspaceSubject,
              await session.getAccessToken(false),
              familyId,
            );
            reopen();
            setSnapshot({ status: "waiting", message: null });
          } catch {
            setSnapshot({
              status: "failed",
              message: "This family's copy could not be refreshed. Try again when online.",
            });
          }
          return;
        }
        if (error instanceof MobileSyncTransportError && error.code === "full_resync_required") {
          try {
            if (!session.subject) {
              throw new Error("Sign in again to recover this workspace.", { cause: error });
            }
            const recoveryToken = await session.getAccessToken(true);
            await recoverLocalWorkspace(workspaceSubject, recoveryToken, familyId);
            reopen();
            setSnapshot({ status: "waiting", message: null });
          } catch {
            setSnapshot({
              status: "full-resync-required",
              message:
                "This local copy needs recovery before it can accept more server changes. Existing local data was preserved.",
            });
          }
          return;
        }
        if (
          error instanceof MobileSyncTransportError &&
          error.code !== "session_expired" &&
          error.code !== "permanent_rejection" &&
          error.code !== "idempotency_mismatch" &&
          // Only an app update clears it; the outbox waits for the updated app's next sync.
          error.code !== "update_required"
        ) {
          await scheduleOutstandingRetry().catch(() => undefined);
        }
        if (stale()) return;
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

    const startTimer = setTimeout(() => void run(), INITIAL_SYNC_DELAY_MS);
    return () => {
      clearTimeout(startTimer);
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    attempt,
    enabled,
    familyId,
    familyName,
    forgetFamily,
    markSynced,
    reachable,
    refreshFamilies,
    reopen,
    session,
    unavailableMessage,
    workspace,
    workspaceSubject,
  ]);

  // The background sync task can only reuse the mounted engine. When the app
  // is terminated there is no React tree, the runner stays null, and the task
  // declines instead of half-synchronizing without the workspace and session.
  // A background run also uploads what other workspaces on this phone still hold.
  useEffect(() => {
    if (!workspace || session.status !== "signed-in" || !enabled) {
      setBackgroundSyncRunner(null);
      return;
    }
    setBackgroundSyncRunner(() => {
      drainRequestedRef.current = true;
      setAttempt((value) => value + 1);
      return Promise.resolve();
    });
    return () => setBackgroundSyncRunner(null);
  }, [enabled, session.status, workspace]);

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
