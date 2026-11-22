import { useNetInfo } from "@react-native-community/netinfo";
import { MOBILE_SYNC_PROTOCOL_VERSION, type MobileSyncPullResponse } from "@zoption/shared";
import { act, render, waitFor } from "@testing-library/react-native";

import { acknowledgeMobileSync, pullMobileSync } from "@/api/mobile-sync";
import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
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

    // Later refreshes must never drop hasSynced back to false.
    await act(async () => latest.retry());
    expect(latest.hasSynced).toBe(true);
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
});
