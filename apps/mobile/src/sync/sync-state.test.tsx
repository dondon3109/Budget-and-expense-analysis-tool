import { useNetInfo } from "@react-native-community/netinfo";
import { MOBILE_SYNC_PROTOCOL_VERSION, type MobileSyncPullResponse } from "@zoption/shared";
import { act, render, waitFor } from "@testing-library/react-native";

import { acknowledgeMobileSync, MobileSyncTransportError, pullMobileSync } from "@/api/mobile-sync";
import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { LocalSyncApplyError } from "@/db/sync-repository";
import { recoverLocalWorkspace, type LocalWorkspace } from "@/db/workspace";
import { useActiveWorkspace } from "@/features/family/active-workspace";

import { SyncProvider, useSyncState } from "./sync-state";

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: jest.fn(),
}));
jest.mock("@/api/mobile-sync", () => ({
  ...jest.requireActual("@/api/mobile-sync"),
  acknowledgeMobileSync: jest.fn(),
  pullMobileSync: jest.fn(),
  pushMobileSync: jest.fn(),
}));
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({ useLocalWorkspace: jest.fn() }));
jest.mock("@/db/workspace", () => ({
  recoverLocalWorkspace: jest.fn(async () => undefined),
  withDetachedWorkspace: jest.fn(),
}));
jest.mock("@/features/family/active-workspace", () => ({ useActiveWorkspace: jest.fn() }));
jest.mock("@/features/subscriptions/subscription-usage-upload", () => ({
  uploadSubscriptionUsage: jest.fn(async () => undefined),
}));
jest.mock("./background-sync-task", () => ({ setBackgroundSyncRunner: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeWorkspace(hasSynced: boolean): LocalWorkspace {
  let cursor: string | null = hasSynced ? "v1.1" : null;
  return {
    databaseName: "test.db",
    hasSynced,
    syncRepository: {
      getCursor: jest.fn(async () => cursor),
      applyPullPage: jest.fn(async (_expected, page: { nextCursor: string }) => {
        cursor = page.nextCursor;
      }),
      recordAcknowledgement: jest.fn(async () => undefined),
      recordFailure: jest.fn(async () => undefined),
    },
    transactionMutations: {
      getPushBatch: jest.fn(async () => null),
      clientId: jest.fn(async () => "client-1"),
      getPushSchedule: jest.fn(async () => ({
        blockedCount: 0,
        outstandingCount: 0,
        nextAttemptAt: null,
      })),
    },
  } as unknown as LocalWorkspace;
}

describe("SyncProvider initial sync state", () => {
  let latest: ReturnType<typeof useSyncState>;
  const Probe = () => {
    latest = useSyncState();
    return null;
  };

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
    jest.mocked(useActiveWorkspace).mockReturnValue({
      status: "ready",
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
  });

  it("keeps hasSynced false across multi-page initial sync until acknowledged, then stays true on retries", async () => {
    const workspace = makeWorkspace(false);
    jest.mocked(useLocalWorkspace).mockReturnValue({
      status: "ready",
      workspace,
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });

    const page2 = deferred<MobileSyncPullResponse>();
    jest
      .mocked(pullMobileSync)
      .mockResolvedValueOnce({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.1",
        hasMore: true,
      })
      .mockReturnValueOnce(page2.promise)
      .mockResolvedValueOnce({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.2",
        hasMore: false,
      });
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.2",
      retentionFloorCursor: "v1.0",
    });

    const view = await render(
      <SyncProvider enabled={false}>
        <Probe />
      </SyncProvider>,
    );
    expect(latest.hasSynced).toBe(false);
    expect(latest.status).toBe("waiting");

    await view.rerender(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );
    await waitFor(() => expect(pullMobileSync).toHaveBeenCalledTimes(2));
    expect(latest.hasSynced).toBe(false);
    expect(latest.status).toBe("syncing");

    await act(async () => {
      page2.resolve({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes: [],
        nextCursor: "v1.2",
        hasMore: false,
      });
    });

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(latest.hasSynced).toBe(true);
    expect(workspace.hasSynced).toBe(true);

    // Later refreshes must never drop hasSynced back to false, even while the follow-up run syncs.
    await act(async () => latest.retry());
    expect(latest.hasSynced).toBe(true);
    await waitFor(() => expect(pullMobileSync).toHaveBeenCalledTimes(3));
    expect(latest.hasSynced).toBe(true);
  });

  it("retries the pull loop when acknowledgement hits a cursor mismatch", async () => {
    const workspace = makeWorkspace(false);
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
    jest.mocked(acknowledgeMobileSync).mockResolvedValue({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      acknowledgedCursor: "v1.1",
      retentionFloorCursor: "v1.0",
    });

    await render(
      <SyncProvider enabled={true}>
        <Probe />
      </SyncProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("synced"));
    expect(latest.hasSynced).toBe(true);
    expect(pullMobileSync).toHaveBeenCalledTimes(2);
  });

  it("reports hasSynced true immediately for an already-synced workspace even offline", async () => {
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

    await render(
      <SyncProvider enabled={false}>
        <Probe />
      </SyncProvider>,
    );

    expect(latest.hasSynced).toBe(true);
    expect(latest.offline).toBe(true);
  });

  it("does not restart an in-flight sync when useSessionSnapshot returns a new object with the same fields", async () => {
    const workspace = makeWorkspace(false);
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
    const workspace = makeWorkspace(false);
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
