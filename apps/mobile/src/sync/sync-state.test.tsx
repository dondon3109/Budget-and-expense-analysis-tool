import { useNetInfo } from "@react-native-community/netinfo";
import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  type MobileSyncPullResponse,
  type MobileSyncSnapshotResponse,
} from "@zoption/shared";
import { act, render, waitFor } from "@testing-library/react-native";

import {
  acknowledgeMobileSync,
  MobileSyncTransportError,
  pullMobileSync,
  snapshotMobileSync,
} from "@/api/mobile-sync";
import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { LocalSyncApplyError } from "@/db/sync-repository";
import {
  isWorkspaceSyncDirty,
  markWorkspaceSyncDirty,
  recoverLocalWorkspace,
  withDetachedWorkspace,
  type LocalWorkspace,
} from "@/db/workspace";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { uploadQueuedReceipts } from "@/features/family/receipt-uploads";

import { setBackgroundSyncRunner } from "./background-sync-task";
import { SyncProvider, useSyncState } from "./sync-state";

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: jest.fn(),
}));
jest.mock("@/api/mobile-sync", () => ({
  ...jest.requireActual("@/api/mobile-sync"),
  acknowledgeMobileSync: jest.fn(),
  pullMobileSync: jest.fn(),
  pushMobileSync: jest.fn(),
  snapshotMobileSync: jest.fn(),
}));
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({ useLocalWorkspace: jest.fn() }));
jest.mock("@/db/workspace", () => ({
  ...jest.requireActual("@/db/workspace"),
  isWorkspaceSyncDirty: jest.fn(),
  markWorkspaceSyncDirty: jest.fn(),
  recoverLocalWorkspace: jest.fn(async () => undefined),
  withDetachedWorkspace: jest.fn(),
}));
jest.mock("@/features/family/active-workspace", () => ({ useActiveWorkspace: jest.fn() }));
jest.mock("@/features/family/receipt-uploads", () => ({
  uploadQueuedReceipts: jest.fn(async () => undefined),
}));
jest.mock("@/features/subscriptions/subscription-usage-upload", () => ({
  uploadSubscriptionUsage: jest.fn(async () => undefined),
}));
jest.mock("./background-sync-task", () => ({ setBackgroundSyncRunner: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface WorkspaceOptions {
  hasSynced: boolean;
  serverCursor?: string | null;
  serverAcknowledgedCursor?: string | null;
  lastSyncedAt?: string | null;
  pendingOutbox?: boolean;
  pendingSyncWork?: boolean;
  syncedEntityRows?: boolean;
}

function makeWorkspace(options: boolean | WorkspaceOptions): LocalWorkspace {
  const opts = typeof options === "boolean" ? { hasSynced: options } : options;
  let cursor: string | null =
    opts.serverCursor !== undefined ? opts.serverCursor : opts.hasSynced ? "v1.1" : null;
  let acknowledgedCursor: string | null =
    opts.serverAcknowledgedCursor !== undefined
      ? opts.serverAcknowledgedCursor
      : opts.hasSynced
        ? cursor
        : null;
  let lastSyncedAt: string | null =
    opts.lastSyncedAt !== undefined
      ? opts.lastSyncedAt
      : opts.hasSynced
        ? new Date().toISOString()
        : null;
  const pendingOutbox = opts.pendingOutbox ?? false;
  const pendingSyncWork = opts.pendingSyncWork ?? pendingOutbox;

  return {
    databaseName: "test.db",
    hasSynced: opts.hasSynced,
    syncRepository: {
      getCursor: jest.fn(async () => cursor),
      getSyncSummary: jest.fn(async () => ({
        serverCursor: cursor,
        serverAcknowledgedCursor: acknowledgedCursor,
        lastSyncedAt,
      })),
      applyPullPage: jest.fn(async (_expected, page: { nextCursor: string }) => {
        cursor = page.nextCursor;
      }),
      hasSyncedEntityRows: jest.fn(async () => opts.syncedEntityRows ?? false),
      applySnapshotPage: jest.fn(async () => undefined),
      recordSnapshotCompletion: jest.fn(async (resumeCursor: string) => {
        cursor = resumeCursor;
        lastSyncedAt = new Date().toISOString();
      }),
      recordAcknowledgement: jest.fn(async (ackCursor: string) => {
        acknowledgedCursor = ackCursor;
      }),
      recordFailure: jest.fn(async () => undefined),
    },
    transactionMutations: {
      getPushBatch: jest.fn(async () => null),
      hasPendingOutbox: jest.fn(async () => pendingOutbox),
      hasPendingSyncWork: jest.fn(async () => pendingSyncWork),
      clientId: jest.fn(async () => "client-1"),
      getPushSchedule: jest.fn(async () => ({
        blockedCount: 0,
        outstandingCount: 0,
        nextAttemptAt: null,
      })),
    },
  } as unknown as LocalWorkspace;
}

describe("SyncProvider", () => {
  let latest: ReturnType<typeof useSyncState>;
  const Probe = () => {
    latest = useSyncState();
    return null;
  };

  const baseActive = () => ({
    status: "ready" as const,
    family: null,
    families: [],
    synced: [],
    closesAt: null,
    closing: {},
    writable: true,
    workspaceSubject: "user-1",
    switchTo: jest.fn(),
    markSynced: jest.fn(),
    forgetFamily: jest.fn(),
    refresh: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    } as ReturnType<typeof useNetInfo>);
    jest.mocked(useSessionSnapshot).mockReturnValue({
      status: "signed-in",
      subject: "user-1",
      getAccessToken: jest.fn(async () => "token"),
      signOut: jest.fn(async () => undefined),
    } as unknown as SessionContextValue);
    jest.mocked(useActiveWorkspace).mockReturnValue(baseActive());
    jest.mocked(isWorkspaceSyncDirty).mockReturnValue(undefined);
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.1",
      retentionFloorCursor: "v1.0",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps hasSynced false across multi-page snapshot initial sync until acknowledged, then stays true on retries", async () => {
    const workspace = makeWorkspace(false);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });

    const page2 = deferred<MobileSyncSnapshotResponse>();
    jest
      .mocked(snapshotMobileSync)
      .mockResolvedValueOnce({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        snapshotCursor: "s1.1",
        changes: [],
        nextOffset: 0,
        hasMore: true,
        resumeCursor: "v1.2",
      })
      .mockReturnValueOnce(page2.promise);
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.2",
      retentionFloorCursor: "v1.0",
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.2",
      hasMore: false,
    });

    const view = await render(
      <SyncProvider enabled={false}>
        <Probe />
      </SyncProvider>,
    );
    expect(latest.hasSynced).toBe(false);
    expect(latest.status).toBe("waiting");
    expect(snapshotMobileSync).not.toHaveBeenCalled();

    await view.rerender(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await waitFor(() => expect(snapshotMobileSync).toHaveBeenCalledTimes(2));
    expect(pullMobileSync).not.toHaveBeenCalled();
    expect(latest.hasSynced).toBe(false);
    expect(latest.status).toBe("syncing");

    await act(async () => {
      page2.resolve({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        snapshotCursor: "s1.1",
        changes: [],
        nextOffset: 0,
        hasMore: false,
        resumeCursor: "v1.2",
      });
    });

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(latest.hasSynced).toBe(true);
    expect(workspace.hasSynced).toBe(true);
    expect(acknowledgeMobileSync).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "v1.2", clientId: "client-1" }),
    );

    // Later refreshes use incremental pull and never drop hasSynced back to false.
    await act(async () => latest.retry());
    expect(latest.hasSynced).toBe(true);
    await waitFor(() => expect(pullMobileSync).toHaveBeenCalledTimes(1));
    expect(latest.hasSynced).toBe(true);
  });

  it("pulls from the start instead of snapshotting when an interrupted snapshot left rows", async () => {
    const workspace = makeWorkspace({ hasSynced: false, syncedEntityRows: true });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.1",
      hasMore: false,
    });

    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(snapshotMobileSync).not.toHaveBeenCalled();
    expect(pullMobileSync).toHaveBeenCalledWith(expect.objectContaining({ cursor: null }));
  });

  it("falls back to incremental pull when initial sync has outbox rows and retries on acknowledgement cursor mismatch", async () => {
    const workspace = makeWorkspace({ hasSynced: false, pendingOutbox: true });
    jest
      .mocked(workspace.syncRepository.recordAcknowledgement)
      .mockRejectedValueOnce(new LocalSyncApplyError("cursor raced", "cursor_mismatch"))
      .mockResolvedValueOnce(undefined);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.1",
      hasMore: false,
    });

    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(snapshotMobileSync).not.toHaveBeenCalled();
    expect(latest.hasSynced).toBe(true);
    expect(pullMobileSync).toHaveBeenCalledTimes(2);
  });

  it("reports waiting with offline true and null message when offline even while disabled, and keeps online disabled errors", async () => {
    const onUnavailableRetry = jest.fn();
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    } as ReturnType<typeof useNetInfo>);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace: makeWorkspace(true),
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });

    const view = await render(
      <SyncProvider
        enabled={false}
        unavailableMessage="You're offline. Changes stay on this device and sync when you reconnect."
        onUnavailableRetry={onUnavailableRetry}
      >
        <Probe />
      </SyncProvider>,
    );

    expect(latest.status).toBe("waiting");
    expect(latest.offline).toBe(true);
    expect(latest.message).toBeNull();
    expect(latest.hasSynced).toBe(true);

    // Once back online while still !enabled, surface unavailableMessage and onUnavailableRetry.
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    } as ReturnType<typeof useNetInfo>);

    await view.rerender(
      <SyncProvider
        enabled={false}
        unavailableMessage="Workspace verification failed."
        onUnavailableRetry={onUnavailableRetry}
      >
        <Probe />
      </SyncProvider>,
    );

    expect(latest.status).toBe("failed");
    expect(latest.offline).toBe(false);
    expect(latest.message).toBe("Workspace verification failed.");
    latest.retry();
    expect(onUnavailableRetry).toHaveBeenCalledTimes(1);
  });

  it("skips applyPullPage, acknowledgeMobileSync, and recordAcknowledgement on a fresh unchanged no-op pull", async () => {
    const workspace = makeWorkspace({
      hasSynced: true,
      serverCursor: "v1.5",
      serverAcknowledgedCursor: "v1.5",
      lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.5",
      hasMore: false,
    });

    jest.useFakeTimers();
    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(pullMobileSync).toHaveBeenCalledTimes(1);
    expect(workspace.syncRepository.applyPullPage).not.toHaveBeenCalled();
    expect(acknowledgeMobileSync).not.toHaveBeenCalled();
    expect(workspace.syncRepository.recordAcknowledgement).not.toHaveBeenCalled();
  });

  it("still acknowledges heartbeat when unchanged no-op pull has stale (>= 12h) lastSyncedAt", async () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    const workspace = makeWorkspace({
      hasSynced: true,
      serverCursor: "v1.5",
      serverAcknowledgedCursor: "v1.5",
      lastSyncedAt: thirteenHoursAgo,
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.5",
      hasMore: false,
    });
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.5",
      retentionFloorCursor: "v1.0",
    });

    jest.useFakeTimers();
    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(workspace.syncRepository.applyPullPage).toHaveBeenCalledTimes(1);
    expect(acknowledgeMobileSync).toHaveBeenCalledTimes(1);
    expect(workspace.syncRepository.recordAcknowledgement).toHaveBeenCalledWith("v1.5", "v1.0");
  });

  it("delays 400ms only on first mount of synced workspace and runs immediately with ignoreBackoff on retry, reconnect, and background sync", async () => {
    jest.useFakeTimers();
    const workspace = makeWorkspace({
      hasSynced: true,
      serverCursor: "v1.1",
      serverAcknowledgedCursor: "v1.1",
      lastSyncedAt: new Date().toISOString(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.1",
      hasMore: false,
    });

    const view = await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(399);
    });
    expect(workspace.transactionMutations.getPushBatch).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenCalledTimes(1);
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenLastCalledWith(50, {
      ignoreBackoff: false,
    });

    // Explicit retry runs immediately (0ms) with ignoreBackoff: true.
    await act(async () => {
      latest.retry();
    });
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenCalledTimes(2);
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenLastCalledWith(50, {
      ignoreBackoff: true,
    });

    // Offline -> online reconnect runs immediately (0ms) with ignoreBackoff: true.
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    } as ReturnType<typeof useNetInfo>);
    await view.rerender(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    expect(latest.offline).toBe(true);

    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    } as ReturnType<typeof useNetInfo>);
    await view.rerender(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenCalledTimes(3);
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenLastCalledWith(50, {
      ignoreBackoff: true,
    });

    // Background trigger runs immediately (0ms) with ignoreBackoff: true.
    const registeredRunner = jest.mocked(setBackgroundSyncRunner).mock.calls.at(-1)?.[0];
    expect(registeredRunner).toBeTruthy();
    let bgDone = false;
    await act(async () => {
      void registeredRunner!().then(() => {
        bgDone = true;
      });
    });
    expect(bgDone).toBe(true);
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenCalledTimes(4);
    expect(workspace.transactionMutations.getPushBatch).toHaveBeenLastCalledWith(50, {
      ignoreBackoff: true,
    });
  });

  it("skips clean secondary workspaces and drains dirty ones with abort signal in drainOtherWorkspaces", async () => {
    const workspace = makeWorkspace({
      hasSynced: true,
      serverCursor: "v1.1",
      serverAcknowledgedCursor: "v1.1",
      lastSyncedAt: new Date().toISOString(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useActiveWorkspace).mockReturnValue({
      ...baseActive(),
      families: [
        { id: "family-clean", kind: "family", name: "Clean", role: "owner" },
        { id: "family-dirty", kind: "family", name: "Dirty", role: "owner" },
      ],
      synced: ["family-clean", "family-dirty"],
    });
    jest.mocked(isWorkspaceSyncDirty).mockImplementation((subject) => {
      if (subject === "user-1#family:family-clean") return false;
      if (subject === "user-1#family:family-dirty") return true;
      return undefined;
    });
    const dirtyWorkspace = makeWorkspace({ hasSynced: true, pendingSyncWork: true });
    jest
      .mocked(dirtyWorkspace.transactionMutations.hasPendingSyncWork)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    jest.mocked(withDetachedWorkspace).mockImplementation(async (_subject, task) => {
      return task(dirtyWorkspace);
    });
    jest.mocked(pullMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      changes: [],
      nextCursor: "v1.1",
      hasMore: false,
    });

    jest.useFakeTimers();
    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });

    expect(withDetachedWorkspace).toHaveBeenCalledTimes(1);
    expect(withDetachedWorkspace).toHaveBeenCalledWith(
      "user-1#family:family-dirty",
      expect.any(Function),
    );
    expect(uploadQueuedReceipts).toHaveBeenCalledWith(
      dirtyWorkspace,
      expect.objectContaining({
        accessToken: "token",
        workspaceId: "family-dirty",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(markWorkspaceSyncDirty).toHaveBeenCalledWith("user-1#family:family-dirty", false);
  });

  it("schedules bounded exponential backoff for transient pull errors with empty outbox, respects Retry-After, and cleans up on manual retry/unmount", async () => {
    jest.useFakeTimers();
    const workspace = makeWorkspace(false);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest
      .mocked(snapshotMobileSync)
      .mockRejectedValueOnce(new MobileSyncTransportError("Server down", "retryable", 503))
      .mockRejectedValueOnce(new MobileSyncTransportError("Still down", "retryable", 503))
      .mockRejectedValueOnce(new MobileSyncTransportError("Too many", "rate_limited", 429, 90))
      .mockResolvedValueOnce({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        snapshotCursor: "s1.1",
        changes: [],
        nextOffset: 0,
        hasMore: false,
        resumeCursor: "v1.1",
      });
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.1",
      retentionFloorCursor: "v1.0",
    });

    const view = await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("failed"));
    expect(snapshotMobileSync).toHaveBeenCalledTimes(1);

    // First transient retry waits 2_000ms and runs immediately when timer fires.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_999);
    });
    expect(snapshotMobileSync).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(snapshotMobileSync).toHaveBeenCalledTimes(2);
    expect(latest.status).toBe("failed");

    // Second transient retry doubles backoff to 4_000ms.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_999);
    });
    expect(snapshotMobileSync).toHaveBeenCalledTimes(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(snapshotMobileSync).toHaveBeenCalledTimes(3);
    expect(latest.status).toBe("failed");

    // Third failure is rate_limited with Retry-After: 90s -> waits 90_000ms.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(89_999);
    });
    expect(snapshotMobileSync).toHaveBeenCalledTimes(3);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(snapshotMobileSync).toHaveBeenCalledTimes(4);

    // Pending retry timer is cancelled cleanly on unmount without running again.
    jest
      .mocked(pullMobileSync)
      .mockRejectedValueOnce(new MobileSyncTransportError("Timeout", "retryable", 0));
    await act(async () => {
      latest.retry();
    });
    await waitFor(() => expect(latest.status).toBe("failed"));
    expect(pullMobileSync).toHaveBeenCalledTimes(1);

    await view.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(pullMobileSync).toHaveBeenCalledTimes(1);
  });

  it("awaits triggered sync cycle completion in the background sync runner and resolves cleanly on unmount", async () => {
    const workspace = makeWorkspace({
      hasSynced: true,
      serverCursor: "v1.1",
      serverAcknowledgedCursor: "v1.1",
      lastSyncedAt: new Date().toISOString(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    const firstPull = deferred<MobileSyncPullResponse>();
    const bgPull = deferred<MobileSyncPullResponse>();
    const unmountPull = deferred<MobileSyncPullResponse>();
    jest
      .mocked(pullMobileSync)
      .mockReturnValueOnce(firstPull.promise)
      .mockReturnValueOnce(bgPull.promise)
      .mockReturnValueOnce(unmountPull.promise);

    jest.useFakeTimers();
    const view = await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      firstPull.resolve({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.1",
        hasMore: false,
      });
    });
    await waitFor(() => expect(latest.status).toBe("synced"));

    const runner = jest.mocked(setBackgroundSyncRunner).mock.calls.at(-1)?.[0];
    expect(runner).toBeTruthy();

    let resolved = false;
    await act(async () => {
      void runner!().then(() => {
        resolved = true;
      });
    });
    expect(pullMobileSync).toHaveBeenCalledTimes(2);
    expect(resolved).toBe(false);

    await act(async () => {
      bgPull.resolve({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.1",
        hasMore: false,
      });
    });
    expect(resolved).toBe(true);

    // Unmounting mid-run still resolves the background runner cleanly.
    let resolvedOnUnmount = false;
    await act(async () => {
      void runner!().then(() => {
        resolvedOnUnmount = true;
      });
    });
    expect(resolvedOnUnmount).toBe(false);
    await view.unmount();
    expect(resolvedOnUnmount).toBe(true);
  });

  it("does not restart an in-flight sync when useSessionSnapshot returns a new object with the same fields", async () => {
    const workspace = makeWorkspace({ hasSynced: false, serverCursor: "v1.0" });
    const getAccessToken = jest.fn(async () => "token");
    const signOut = jest.fn(async () => undefined);
    jest.mocked(useSessionSnapshot).mockImplementation(
      () =>
        ({
          status: "signed-in",
          subject: "user-1",
          getAccessToken,
          signOut,
        }) as unknown as SessionContextValue,
    );
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    const firstPull = deferred<MobileSyncPullResponse>();
    jest.mocked(pullMobileSync).mockReturnValueOnce(firstPull.promise);
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.1",
      retentionFloorCursor: "v1.0",
    });

    const view = await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await waitFor(() => expect(pullMobileSync).toHaveBeenCalledTimes(1));

    await view.rerender(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    expect(pullMobileSync).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstPull.resolve({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.1",
        hasMore: false,
      });
    });
    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(pullMobileSync).toHaveBeenCalledTimes(1);
  });

  it("skips recoverLocalWorkspace if the run becomes stale while refreshing the recovery token", async () => {
    const workspace = makeWorkspace({ hasSynced: false, serverCursor: "v1.0" });
    const reopen = jest.fn();
    const refreshToken = deferred<string>();
    const getAccessToken = jest
      .fn()
      .mockResolvedValueOnce("initial-token")
      .mockReturnValueOnce(refreshToken.promise);
    jest.mocked(useSessionSnapshot).mockReturnValue({
      status: "signed-in",
      subject: "user-1",
      getAccessToken,
      signOut: jest.fn(async () => undefined),
    } as unknown as SessionContextValue);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen,
    });
    jest
      .mocked(pullMobileSync)
      .mockRejectedValueOnce(
        new MobileSyncTransportError("stale cursor", "full_resync_required", 409),
      );

    const view = await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await waitFor(() => expect(getAccessToken).toHaveBeenCalledWith(true));

    await view.unmount();
    await act(async () => {
      refreshToken.resolve("fresh-token");
    });

    expect(recoverLocalWorkspace).not.toHaveBeenCalled();
    expect(reopen).not.toHaveBeenCalled();
  });
});
