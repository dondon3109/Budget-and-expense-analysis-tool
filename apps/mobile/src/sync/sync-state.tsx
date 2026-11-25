import { setBackgroundSyncRunner } from "./background-sync-task";
import { useNetInfo } from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
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
  snapshotMobileSync,
  type WorkspaceAccessCode,
} from "@/api/mobile-sync";
import { refreshPetAfterActivity } from "@/auth/pet-sync";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { LocalSyncApplyError, type LocalSyncSummary } from "@/db/sync-repository";
import type { LocalPushSchedule } from "@/db/transaction-mutation-repository";
import {
  fetchAndApplySnapshot,
  isWorkspaceSyncDirty,
  markWorkspaceSyncDirty,
  recoverLocalWorkspace,
  withDetachedWorkspace,
  type LocalWorkspace,
} from "@/db/workspace";
import { reportPlanLimit } from "@/features/billing/PlanLimitDialog";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { uploadQueuedReceipts } from "@/features/family/receipt-uploads";
import { describeRefusedChanges } from "@/features/family/refused-changes";
import { familySubject } from "@/features/family/workspace-record";
import { uploadSubscriptionUsage } from "@/features/subscriptions/subscription-usage-upload";

import { rateLimitDelaySeconds, withRateLimitWait } from "./rate-limit-wait";

export type ForegroundSyncStatus =
  "waiting" | "syncing" | "synced" | "failed" | "full-resync-required";

interface SyncSnapshot {
  status: ForegroundSyncStatus;
  message: string | null;
  retry: () => void;
  /** True once the open workspace has completed its first sync, or does not sync. */
  hasSynced?: boolean;
  /** True when NetInfo reports no internet connectivity. */
  offline?: boolean;
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
  hasSynced: true,
  offline: false,
});

/**
 * Delay before a launch's first push and pull. The sync work itself is
 * unchanged: this only keeps it from competing with the first screen's read
 * for the JS thread and the serialized local writer.
 */
const INITIAL_SYNC_DELAY_MS = 400;
const ACK_HEARTBEAT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const PULL_RETRY_BASE_MS = 2_000;
const PULL_RETRY_MAX_MS = 60_000;

function abortError(): Error {
  const error = new Error("Synchronization was cancelled.");
  error.name = "AbortError";
  return error;
}

function isSyncTimestampRecent(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // Server change timestamps arrive as UTC "YYYY-MM-DD HH:MM:SS" without a zone suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) && Date.now() - parsed < ACK_HEARTBEAT_INTERVAL_MS;
}

function isTransientSyncError(error: unknown): boolean {
  return (
    (error instanceof MobileSyncTransportError &&
      (error.code === "retryable" || error.code === "rate_limited")) ||
    isAuthRetryableFetchError(error)
  );
}

function computePullRetryDelayMs(error: unknown, retryAttempt: number): number {
  const exponentialDelayMs = Math.min(
    PULL_RETRY_BASE_MS * 2 ** Math.min(retryAttempt, 10),
    PULL_RETRY_MAX_MS,
  );
  if (error instanceof MobileSyncTransportError && error.code === "rate_limited") {
    if (error.retryAfterSeconds !== null) {
      return rateLimitDelaySeconds(error, 300) * 1000;
    }
    return Math.max(exponentialDelayMs, rateLimitDelaySeconds(error, 300) * 1000);
  }
  return exponentialDelayMs;
}

function settleWaiters(waiters: (() => void)[]): void {
  for (const resolve of waiters) resolve();
}

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
 * null). `completed` is false once `stale` says a newer run took over; `pushed` says whether any
 * batch was sent.
 */
async function pushOutbox(
  workspace: LocalWorkspace,
  workspaceId: string | null,
  auth: SyncAuth,
  signal: AbortSignal,
  stale: () => boolean,
  ignoreBackoff = false,
): Promise<{ completed: boolean; pushed: boolean }> {
  let pushed = false;
  for (let batchNumber = 0; batchNumber < 100; batchNumber += 1) {
    const request = await workspace.transactionMutations.getPushBatch(50, { ignoreBackoff });
    if (!request) return { completed: true, pushed };
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
        !isWorkspaceRefusal(error) &&
        // Left pending, so they upload once the family's plan is renewed.
        error.code !== "workspace_lapsed"
      ) {
        await workspace.transactionMutations.recordPushFailure(
          request,
          error.code,
          error.retryAfterSeconds,
        );
      }
      throw error;
    }
    if (stale()) return { completed: false, pushed };
    await workspace.transactionMutations.applyPushResponse(request, response);
    pushed = true;
    const limit = response.results.find(
      (result) => result.status === "rejected" && result.code === "plan_limit",
    );
    if (limit?.status === "rejected") reportPlanLimit(limit.message);
  }
  throw new Error("Synchronization exceeded the safe foreground push limit.");
}

async function readLocalSyncSummary(workspace: LocalWorkspace): Promise<LocalSyncSummary> {
  if (workspace.syncRepository.getSyncSummary) {
    return workspace.syncRepository.getSyncSummary();
  }
  return {
    serverCursor: await workspace.syncRepository.getCursor(),
    serverAcknowledgedCursor: null,
    lastSyncedAt: null,
  };
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
  const {
    status: sessionStatus,
    subject: sessionSubject,
    getAccessToken,
    signOut: signOutSession,
  } = useSessionSnapshot();
  const active = useActiveWorkspace();
  const {
    markSynced,
    forgetFamily,
    refresh: refreshFamilies,
    workspaceSubject,
    families: activeFamilies,
    synced: activeSynced,
  } = active;
  const familyId = active.family?.id ?? null;
  const familyName = active.family?.name ?? null;
  const netInfo = useNetInfo();
  // NetInfo starts at null before resolving to true; keying on offline avoids aborting and
  // restarting the launch sync once connectivity settles.
  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;
  const [attempt, setAttempt] = useState(0);
  const [syncedWorkspace, setSyncedWorkspace] = useState<LocalWorkspace | null>(null);
  const [snapshot, setSnapshot] = useState<Omit<SyncSnapshot, "retry">>({
    status: "waiting",
    message: null,
  });
  const requestRef = useRef(0);
  const wasOfflineRef = useRef(offline);
  const reconnectedRef = useRef(false);
  const manualRetryRef = useRef(false);
  const backgroundTriggerRef = useRef(false);
  const timerWakeRef = useRef(false);
  const initialMountDelayConsumedRef = useRef(false);
  const pullRetryAttemptRef = useRef(0);
  const pendingBackgroundWaitersRef = useRef<(() => void)[]>([]);

  // Every other workspace on this phone that may hold changes made before a switch. They upload
  // after the shown one syncs, once per launch, switch, or background run, never pulling.
  const drainTargets = useMemo<DrainTarget[]>(() => {
    if (!sessionSubject) return [];
    const subject = sessionSubject;
    const families = activeSynced
      .filter((id) => id !== familyId && activeFamilies.some((family) => family.id === id))
      .map((id) => ({ subject: familySubject(subject, id), workspaceId: id }));
    return familyId ? [{ subject, workspaceId: null }, ...families] : families;
  }, [activeFamilies, activeSynced, familyId, sessionSubject]);
  const drainTargetsRef = useRef(drainTargets);
  const drainRequestedRef = useRef(true);
  useEffect(() => {
    drainTargetsRef.current = drainTargets;
  }, [drainTargets]);
  useEffect(() => {
    drainRequestedRef.current = true;
    pullRetryAttemptRef.current = 0;
  }, [workspace, workspaceSubject]);

  useEffect(() => {
    const waiters = pendingBackgroundWaitersRef.current;
    return () => {
      settleWaiters(waiters.splice(0));
    };
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!workspace || sessionStatus !== "signed-in") {
      settleWaiters(pendingBackgroundWaitersRef.current.splice(0));
      return;
    }
    if (isDummyDevelopmentSubject(sessionSubject)) {
      settleWaiters(pendingBackgroundWaitersRef.current.splice(0));
      setSnapshot({
        status: "synced",
        message: null,
      });
      return;
    }
    if (offline) {
      wasOfflineRef.current = true;
      reconnectedRef.current = false;
      manualRetryRef.current = false;
      backgroundTriggerRef.current = false;
      timerWakeRef.current = false;
      pullRetryAttemptRef.current = 0;
      settleWaiters(pendingBackgroundWaitersRef.current.splice(0));
      setSnapshot({
        status: "waiting",
        message: null,
      });
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      reconnectedRef.current = true;
      pullRetryAttemptRef.current = 0;
    }
    if (!enabled) {
      settleWaiters(pendingBackgroundWaitersRef.current.splice(0));
      setSnapshot({
        status: unavailableMessage ? "failed" : "waiting",
        message: unavailableMessage,
      });
      return;
    }

    const isReconnect = reconnectedRef.current;
    const isManualRetry = manualRetryRef.current;
    const isBackground = backgroundTriggerRef.current;
    const isTimerWake = timerWakeRef.current;
    reconnectedRef.current = false;
    manualRetryRef.current = false;
    backgroundTriggerRef.current = false;
    timerWakeRef.current = false;

    const ignoreBackoff = isReconnect || isManualRetry || isBackground;
    const isInitialMountedSyncedRun =
      !initialMountDelayConsumedRef.current &&
      workspace.hasSynced &&
      !ignoreBackoff &&
      !isTimerWake;
    initialMountDelayConsumedRef.current = true;
    const delayMs = isInitialMountedSyncedRun ? INITIAL_SYNC_DELAY_MS : 0;

    const activeBackgroundWaiters = pendingBackgroundWaitersRef.current.splice(0);
    const controller = new AbortController();
    const stale = () => requestRef.current !== requestId || controller.signal.aborted;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleOutstandingRetry = async (): Promise<LocalPushSchedule> => {
      const schedule = await workspace.transactionMutations.getPushSchedule();
      if (schedule.nextAttemptAt && !stale()) {
        const delay = Math.max(250, Date.parse(schedule.nextAttemptAt) - Date.now());
        retryTimer = setTimeout(() => {
          timerWakeRef.current = true;
          setAttempt((value) => value + 1);
        }, delay);
      }
      return schedule;
    };
    const drainOtherWorkspaces = async (auth: SyncAuth) => {
      if (!drainRequestedRef.current) return;
      for (const target of drainTargetsRef.current) {
        if (stale() || controller.signal.aborted) return;
        if (isWorkspaceSyncDirty(target.subject) === false) continue;
        try {
          await withDetachedWorkspace(target.subject, async (other) => {
            if (stale() || controller.signal.aborted) return;
            const hasPending = other.transactionMutations.hasPendingSyncWork
              ? await other.transactionMutations.hasPendingSyncWork()
              : true;
            if (!hasPending) {
              markWorkspaceSyncDirty(target.subject, false);
              return;
            }
            const drained = await pushOutbox(
              other,
              target.workspaceId,
              auth,
              controller.signal,
              stale,
              ignoreBackoff,
            );
            if (!drained.completed) return;
            if (!target.workspaceId && drained.pushed) {
              refreshPetAfterActivity(getAccessToken);
            }
            if (target.workspaceId && !controller.signal.aborted && !stale()) {
              await uploadQueuedReceipts(other, {
                accessToken: auth.token,
                workspaceId: target.workspaceId,
                signal: controller.signal,
              });
            }
            if (other.transactionMutations.hasPendingSyncWork) {
              markWorkspaceSyncDirty(
                target.subject,
                await other.transactionMutations.hasPendingSyncWork(),
              );
            }
          });
        } catch (error) {
          // Each stays queued for its own next sync; only a lost membership is settled here.
          if (target.workspaceId && isWorkspaceRefusal(error)) {
            if (error.code === "workspace_forbidden") await forgetFamily(target.workspaceId);
          }
        }
      }
      if (!stale() && !controller.signal.aborted) {
        drainRequestedRef.current = false;
      }
    };

    setSnapshot({ status: "syncing", message: null });
    const run = async (): Promise<void> => {
      if (controller.signal.aborted) {
        settleWaiters(activeBackgroundWaiters);
        return;
      }
      try {
        const auth: SyncAuth = {
          token: await getAccessToken(false),
          refreshed: false,
          getAccessToken,
        };
        if (stale()) return;
        const pushedResult = await pushOutbox(
          workspace,
          familyId,
          auth,
          controller.signal,
          stale,
          ignoreBackoff,
        );
        if (!pushedResult.completed) return;
        const pushedPersonal = !familyId && pushedResult.pushed;

        const runWithAuth = <T,>(
          call: (accessToken: string, signal: AbortSignal) => Promise<T>,
          timeoutMessage = TIMED_OUT,
        ) =>
          withRateLimitWait(controller.signal, () =>
            withSessionRetry(auth, (accessToken) =>
              withTimeout(controller.signal, timeoutMessage, (signal) => call(accessToken, signal)),
            ),
          );

        const acknowledgeCursor = async (cursorToAck: string) => {
          const clientId = await workspace.transactionMutations.clientId();
          if (stale()) return;
          const acknowledgement = await runWithAuth(
            (accessToken, signal) =>
              acknowledgeMobileSync({
                accessToken,
                workspaceId: familyId,
                clientId,
                cursor: cursorToAck,
                signal,
              }),
            "Zoption did not confirm synchronization progress before timing out.",
          );
          if (stale()) return;
          await workspace.syncRepository.recordAcknowledgement(
            acknowledgement.acknowledgedCursor,
            acknowledgement.retentionFloorCursor,
          );
        };

        const finishSync = async () => {
          pullRetryAttemptRef.current = 0;
          workspace.hasSynced = true;
          setSyncedWorkspace(workspace);
          // From here the family opens offline (the switcher allows it).
          if (familyId) {
            markSynced(familyId);
            await uploadQueuedReceipts(workspace, {
              accessToken: auth.token,
              workspaceId: familyId,
              signal: controller.signal,
            }).catch(() => undefined);
          } else {
            // Subscription ROI taps wait for a personal sync, after any new bill has synced.
            await uploadSubscriptionUsage(workspace, auth.token).catch(() => undefined);
            if (pushedPersonal) refreshPetAfterActivity(getAccessToken);
          }
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
        };

        let summary = await readLocalSyncSummary(workspace);
        const hasOutbox = workspace.transactionMutations.hasPendingOutbox
          ? await workspace.transactionMutations.hasPendingOutbox()
          : false;
        // Snapshot pages commit one by one and carry no deletes, so a snapshot only seeds an
        // empty workspace. Rows left by an interrupted one pull from the start instead, which
        // replays deletes made since then.
        const hasSyncedRows =
          summary.serverCursor === null &&
          !hasOutbox &&
          workspace.syncRepository.hasSyncedEntityRows
            ? await workspace.syncRepository.hasSyncedEntityRows()
            : false;
        if (stale()) return;

        if (summary.serverCursor === null && !hasOutbox && !hasSyncedRows) {
          const clientId = await workspace.transactionMutations.clientId();
          if (stale()) return;
          const snapshotResult = await fetchAndApplySnapshot({
            syncRepository: workspace.syncRepository,
            fetchPage: (snapshotCursor, offset) => {
              if (stale()) return Promise.reject(abortError());
              return runWithAuth((accessToken, signal) =>
                snapshotMobileSync({
                  accessToken,
                  workspaceId: familyId,
                  clientId,
                  snapshotCursor,
                  offset,
                  signal,
                }),
              );
            },
          });
          if (stale()) return;
          try {
            await acknowledgeCursor(snapshotResult.resumeCursor);
            if (stale()) return;
            await finishSync();
            return;
          } catch (error) {
            if (!(error instanceof LocalSyncApplyError && error.code === "cursor_mismatch")) {
              throw error;
            }
            summary = await readLocalSyncSummary(workspace);
          }
        }

        let appliedAnyChanges = false;
        for (let pageNumber = 0; pageNumber < 250; pageNumber += 1) {
          if (pageNumber > 0) {
            summary = await readLocalSyncSummary(workspace);
          }
          const cursor = summary.serverCursor;
          const page = await runWithAuth((accessToken, signal) =>
            pullMobileSync({ accessToken, workspaceId: familyId, cursor, signal }),
          );
          if (page.hasMore && page.nextCursor === (cursor ?? "v1.0")) {
            throw new Error("Synchronization did not make cursor progress.");
          }
          if (stale()) return;

          const isUnchangedNoOp =
            !appliedAnyChanges &&
            page.changes.length === 0 &&
            !page.hasMore &&
            page.nextCursor === summary.serverCursor &&
            page.nextCursor === summary.serverAcknowledgedCursor &&
            isSyncTimestampRecent(summary.lastSyncedAt);

          if (isUnchangedNoOp) {
            await finishSync();
            return;
          }

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
          if (page.changes.length > 0) appliedAnyChanges = true;
          if (!page.hasMore) {
            try {
              await acknowledgeCursor(page.nextCursor);
            } catch (error) {
              if (error instanceof LocalSyncApplyError && error.code === "cursor_mismatch") {
                continue;
              }
              throw error;
            }
            if (stale()) return;
            await finishSync();
            return;
          }
        }
        throw new Error("Synchronization exceeded the safe foreground page limit.");
      } catch (error) {
        if (stale()) return;
        await workspace.syncRepository.recordFailure().catch(() => undefined);
        if (error instanceof MobileSyncTransportError && error.code === "account_deleted") {
          await signOutSession({ preserveLocalWorkspace: true }).catch(() => undefined);
          return;
        }
        if (
          familyId &&
          error instanceof MobileSyncTransportError &&
          error.code === "workspace_lapsed"
        ) {
          // Read only until renewed: refreshing the family marks it so, and the pending changes
          // wait in the outbox for the first sync after the plan is paid again.
          refreshFamilies();
          setSnapshot({
            status: "failed",
            message: `${familyName ?? "This family"}'s plan has ended. Your changes will upload once it's renewed.`,
          });
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
            const accessToken = await getAccessToken(false);
            if (stale()) return;
            await recoverLocalWorkspace(workspaceSubject, accessToken, familyId);
            if (stale()) return;
            reopen();
            setSnapshot({ status: "waiting", message: null });
          } catch {
            if (stale()) return;
            setSnapshot({
              status: "failed",
              message: "This family's copy could not be refreshed. Try again when online.",
            });
          }
          return;
        }
        if (error instanceof MobileSyncTransportError && error.code === "full_resync_required") {
          try {
            if (!sessionSubject) {
              throw new Error("Sign in again to recover this workspace.", { cause: error });
            }
            const recoveryToken = await getAccessToken(true);
            if (stale()) return;
            await recoverLocalWorkspace(workspaceSubject, recoveryToken, familyId);
            if (stale()) return;
            reopen();
            setSnapshot({ status: "waiting", message: null });
          } catch {
            if (stale()) return;
            setSnapshot({
              status: "full-resync-required",
              message:
                "This local copy needs recovery before it can accept more server changes. Existing local data was preserved.",
            });
          }
          return;
        }
        let schedule: LocalPushSchedule | null = null;
        if (!(
          error instanceof MobileSyncTransportError &&
          (error.code === "session_expired" ||
            error.code === "permanent_rejection" ||
            error.code === "idempotency_mismatch" ||
            // Only an app update clears it; the outbox waits for the updated app's next sync.
            error.code === "update_required")
        )) {
          schedule = await scheduleOutstandingRetry().catch(() => null);
        }
        if (stale()) return;
        if (
          isTransientSyncError(error) &&
          schedule !== null &&
          schedule.outstandingCount === 0 &&
          !schedule.nextAttemptAt
        ) {
          // A pull or snapshot has no outbox row to carry its retry, so the run schedules
          // bounded exponential backoff (and honors Retry-After on rate limits).
          if (retryTimer) clearTimeout(retryTimer);
          const delay = computePullRetryDelayMs(error, pullRetryAttemptRef.current);
          pullRetryAttemptRef.current += 1;
          retryTimer = setTimeout(() => {
            timerWakeRef.current = true;
            setAttempt((value) => value + 1);
          }, delay);
        }
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
      } finally {
        settleWaiters(activeBackgroundWaiters);
      }
    };

    // Only the initial automatic mount sync of an already-synced workspace yields 400ms
    // so first screen reads win the JS thread; every subsequent trigger runs at 0ms.
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    if (delayMs > 0) {
      startTimer = setTimeout(() => void run(), delayMs);
    } else {
      void run();
    }
    return () => {
      if (startTimer !== null) clearTimeout(startTimer);
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      settleWaiters(activeBackgroundWaiters);
    };
  }, [
    attempt,
    enabled,
    familyId,
    familyName,
    forgetFamily,
    getAccessToken,
    markSynced,
    offline,
    refreshFamilies,
    reopen,
    sessionStatus,
    sessionSubject,
    signOutSession,
    unavailableMessage,
    workspace,
    workspaceSubject,
  ]);

  // The background sync task can only reuse the mounted engine. When the app
  // is terminated there is no React tree, the runner stays null, and the task
  // declines instead of half-synchronizing without the workspace and session.
  // A background run also uploads what other workspaces on this phone still hold.
  useEffect(() => {
    const waiters = pendingBackgroundWaitersRef.current;
    if (!workspace || sessionStatus !== "signed-in" || !enabled) {
      setBackgroundSyncRunner(null);
      settleWaiters(waiters.splice(0));
      return;
    }
    setBackgroundSyncRunner(() => {
      const promise = new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
      drainRequestedRef.current = true;
      backgroundTriggerRef.current = true;
      pullRetryAttemptRef.current = 0;
      setAttempt((value) => value + 1);
      return promise;
    });
    return () => {
      setBackgroundSyncRunner(null);
      settleWaiters(waiters.splice(0));
    };
  }, [enabled, sessionStatus, workspace]);

  const retry = useCallback(() => {
    pullRetryAttemptRef.current = 0;
    manualRetryRef.current = true;
    if (!enabled) {
      onUnavailableRetry?.();
      return;
    }
    setAttempt((value) => value + 1);
  }, [enabled, onUnavailableRetry]);
  const hasSynced =
    !workspace ||
    workspace.hasSynced ||
    syncedWorkspace === workspace ||
    sessionStatus !== "signed-in" ||
    isDummyDevelopmentSubject(sessionSubject);
  const value = useMemo(
    () => ({ ...snapshot, retry, hasSynced, offline }),
    [hasSynced, offline, retry, snapshot],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncState(): SyncSnapshot {
  return useContext(SyncContext);
}
