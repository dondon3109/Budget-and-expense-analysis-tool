import { render, waitFor, act } from "@testing-library/react-native";
import React, { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { AuthApiError, AuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { Platform } from "react-native";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
}));

const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureValues.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureValues.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureValues.delete(key);
    return Promise.resolve();
  }),
}));

let mockDevelopmentVariant = false;
jest.mock("@/config/app-variant", () => ({
  isDevelopmentAppVariant: () => mockDevelopmentVariant,
}));

let mockCurrentSession: Session | null = null;
const mockAuth = {
  onAuthStateChange: jest.fn((_callback) => ({
    data: { subscription: { unsubscribe: jest.fn() } },
  })),
  getSession: jest.fn(() =>
    Promise.resolve({ data: { session: mockCurrentSession }, error: null }),
  ),
  refreshSession: jest.fn(() =>
    Promise.resolve({ data: { session: mockCurrentSession }, error: null }),
  ),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  signOut: jest.fn(() => {
    mockCurrentSession = null;
    return Promise.resolve({ error: null });
  }),
};

let mockStoredSubject: string | null = null;
jest.mock("./supabase-client", () => ({
  get supabase() {
    return { auth: mockAuth };
  },
  getSupabaseClient() {
    return { auth: mockAuth };
  },
  readStoredSessionSubject: () => Promise.resolve(mockStoredSubject),
}));

const mockReadDeviceBootCount = jest.fn<Promise<number>, []>(async () => 1);
jest.mock("@/db/local-data-security", () => ({
  readDeviceBootCount: () => mockReadDeviceBootCount(),
  ensureLocalDataBackupProtection: async () => undefined,
}));

jest.mock("@/db/workspace", () => ({
  discardLocalWorkspace: jest.fn(() => Promise.resolve()),
  inspectLocalWorkspaceForSignOut: jest.fn(() =>
    Promise.resolve({ unsyncedOperationCount: 0, unresolvedConflictCount: 0 }),
  ),
}));

import { discardLocalWorkspace, inspectLocalWorkspaceForSignOut } from "@/db/workspace";

import { GUEST_SUBJECT } from "@/db/guest-workspace";
import {
  resetAccountLinkForTests,
  setSignedInAccount,
  useAccountLink,
} from "@/telemetry/account-link";

import { ANDROID_BOOT_COUNT_KEY } from "./android-boot-session";
import { UnsyncedChangesError } from "./sign-out-policy";
import {
  DUMMY_DEV_STORAGE_KEY,
  DUMMY_DEV_SUBJECT,
  GUEST_STORAGE_KEY,
  SessionProvider,
  useSessionSnapshot,
} from "./session-state";

function TestConsumer({
  onSnapshot,
}: {
  onSnapshot: (snap: ReturnType<typeof useSessionSnapshot>) => void;
}) {
  const snap = useSessionSnapshot();
  useEffect(() => {
    onSnapshot(snap);
  }, [snap, onSnapshot]);
  return null;
}

describe("SessionProvider and dummy session handling", () => {
  beforeEach(() => {
    mockSecureValues.clear();
    resetAccountLinkForTests();
    mockDevelopmentVariant = false;
    mockCurrentSession = null;
    mockStoredSubject = null;
    mockAuth.onAuthStateChange.mockReset().mockImplementation((_callback) => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    }));
    mockAuth.getSession
      .mockReset()
      .mockImplementation(() =>
        Promise.resolve({ data: { session: mockCurrentSession }, error: null }),
      );
    mockAuth.refreshSession
      .mockReset()
      .mockImplementation(() =>
        Promise.resolve({ data: { session: mockCurrentSession }, error: null }),
      );
    mockAuth.signOut.mockReset().mockImplementation(() => {
      mockCurrentSession = null;
      return Promise.resolve({ error: null });
    });
    mockAuth.startAutoRefresh.mockReset();
    mockAuth.stopAutoRefresh.mockReset();
    (SecureStore.deleteItemAsync as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (discardLocalWorkspace as jest.Mock).mockClear();
    (inspectLocalWorkspaceForSignOut as jest.Mock)
      .mockReset()
      .mockImplementation(() =>
        Promise.resolve({ unsyncedOperationCount: 0, unresolvedConflictCount: 0 }),
      );
  });

  it("exports the canonical dummy UUID and does not hardcode production user ID", () => {
    expect(DUMMY_DEV_SUBJECT).toBe("00000000-0000-4000-8000-000000000001");
    expect(DUMMY_DEV_SUBJECT).not.toBe("08060c19-8a55-4046-a2e7-7384808dd81c");
  });

  it("returns Supabase access token in release builds even for user 08060c19-8a55-4046-a2e7-7384808dd81c", async () => {
    mockDevelopmentVariant = false;
    const realUserSubject = "08060c19-8a55-4046-a2e7-7384808dd81c";
    mockCurrentSession = {
      access_token: "real-supabase-access-token",
      refresh_token: "refresh-token",
      user: { id: realUserSubject, email: "user@example.com" } as any,
    } as Session;

    let latestSnapshot: ReturnType<typeof useSessionSnapshot> | null = null;
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => (latestSnapshot = snap)} />
        </SessionProvider>,
      );
    });

    await waitFor(() => {
      expect(latestSnapshot?.status).toBe("signed-in");
      expect(latestSnapshot?.subject).toBe(realUserSubject);
    });

    const token = await latestSnapshot!.getAccessToken(false);
    expect(token).toBe("real-supabase-access-token");
  });

  it("purges any stale dummy resources in SecureStore on release build launch", async () => {
    mockDevelopmentVariant = false;
    mockSecureValues.set(DUMMY_DEV_STORAGE_KEY, "08060c19-8a55-4046-a2e7-7384808dd81c");

    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={() => undefined} />
        </SessionProvider>,
      );
    });

    await waitFor(() => {
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(DUMMY_DEV_STORAGE_KEY);
    });
    expect(mockSecureValues.has(DUMMY_DEV_STORAGE_KEY)).toBe(false);
  });

  it("clears dummy session from SecureStore when a real Supabase session is established", async () => {
    mockDevelopmentVariant = true;
    mockSecureValues.set(DUMMY_DEV_STORAGE_KEY, DUMMY_DEV_SUBJECT);
    mockCurrentSession = {
      access_token: "real-token",
      refresh_token: "refresh-token",
      user: { id: "real-user-id", email: "user@example.com" } as any,
    } as Session;

    let latestSnapshot: ReturnType<typeof useSessionSnapshot> | null = null;
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => (latestSnapshot = snap)} />
        </SessionProvider>,
      );
    });

    await waitFor(() => {
      expect(latestSnapshot?.status).toBe("signed-in");
      expect(latestSnapshot?.subject).toBe("real-user-id");
    });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(DUMMY_DEV_STORAGE_KEY);
    expect(mockSecureValues.has(DUMMY_DEV_STORAGE_KEY)).toBe(false);
    const token = await latestSnapshot!.getAccessToken(false);
    expect(token).toBe("real-token");
  });

  it("allows dummy sign-in only in development variant and returns dummy dev token", async () => {
    mockDevelopmentVariant = true;
    mockCurrentSession = null;

    const latest = { current: null as ReturnType<typeof useSessionSnapshot> | null };
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => (latest.current = snap)} />
        </SessionProvider>,
      );
    });

    await waitFor(() => {
      expect(latest.current?.status).toBe("signed-out");
    });

    await act(async () => {
      await latest.current!.signInWithDummyAccount();
    });

    expect(latest.current?.status).toBe("signed-in");
    expect(latest.current?.subject).toBe(DUMMY_DEV_SUBJECT);
    expect(mockSecureValues.get(DUMMY_DEV_STORAGE_KEY)).toBe(DUMMY_DEV_SUBJECT);

    const token = await latest.current!.getAccessToken(false);
    expect(token).toBe("dummy-dev-access-token");

    await act(async () => {
      await latest.current!.signOut();
    });

    expect(latest.current?.status).toBe("signed-out");
    expect(mockSecureValues.has(DUMMY_DEV_STORAGE_KEY)).toBe(false);
  });

  it("rejects dummy account sign-in in release variant", async () => {
    mockDevelopmentVariant = false;
    mockCurrentSession = null;

    let latestSnapshot: ReturnType<typeof useSessionSnapshot> | null = null;
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => (latestSnapshot = snap)} />
        </SessionProvider>,
      );
    });

    await waitFor(() => {
      expect(latestSnapshot?.status).toBe("signed-out");
    });

    await expect(latestSnapshot!.signInWithDummyAccount()).rejects.toThrow(
      "Dummy account sign-in is available only in Zoption Dev.",
    );
  });

  async function renderSignedInSession() {
    mockDevelopmentVariant = false;
    mockCurrentSession = {
      access_token: "real-supabase-access-token",
      refresh_token: "refresh-token",
      user: { id: "real-user-id", email: "user@example.com" } as any,
    } as Session;

    const latest: { current: ReturnType<typeof useSessionSnapshot> | null } = { current: null };
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => (latest.current = snap)} />
        </SessionProvider>,
      );
    });
    await waitFor(() => {
      expect(latest.current?.status).toBe("signed-in");
    });
    return latest;
  }

  it("revokes the refresh token globally on a user-initiated sign-out", async () => {
    const latest = await renderSignedInSession();

    await act(async () => {
      await latest.current!.signOut();
    });

    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(discardLocalWorkspace).toHaveBeenCalledWith("real-user-id");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "zoption.app_lock.real-user-id",
      expect.anything(),
    );
    expect(latest.current?.status).toBe("signed-out");
  });

  it("still clears this device when a global sign-out cannot reach Supabase", async () => {
    const latest = await renderSignedInSession();

    // A failed revoke leaves the stored session in place, exactly like a
    // network error from auth-js: only the local-scope fallback can clear it.
    (mockAuth.signOut as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve({ error: new Error("Network request failed") }))
      .mockImplementationOnce(() => {
        mockCurrentSession = null;
        return Promise.resolve({ error: null });
      });

    // The fallback is deliberately not surfaced: this resolves, it does not
    // reject, because the user did get signed out on this device.
    await act(async () => {
      await latest.current!.signOut();
    });

    expect(mockAuth.signOut).toHaveBeenNthCalledWith(1, { scope: "global" });
    expect(mockAuth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(discardLocalWorkspace).toHaveBeenCalledWith("real-user-id");
    expect(latest.current?.status).toBe("signed-out");
  });

  it("short-circuits redundant TOKEN_REFRESHED events for the settled subject", async () => {
    let onAuth: ((event: string, session: Session | null) => void) | null = null;
    mockAuth.onAuthStateChange.mockImplementation((callback) => {
      onAuth = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    mockCurrentSession = {
      access_token: "token-1",
      refresh_token: "refresh-1",
      user: { id: "real-user-id", email: "user@example.com" } as any,
    } as Session;

    const snapshots: ReturnType<typeof useSessionSnapshot>[] = [];
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => snapshots.push(snap)} />
        </SessionProvider>,
      );
    });
    await waitFor(() => expect(snapshots.at(-1)?.status).toBe("signed-in"));

    const settledContext = snapshots.at(-1)!;
    const countAfterSignIn = snapshots.length;
    (SecureStore.deleteItemAsync as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockClear();

    await act(async () => {
      onAuth?.("TOKEN_REFRESHED", {
        access_token: "token-2",
        refresh_token: "refresh-2",
        user: { id: "real-user-id", email: "user@example.com" } as any,
      } as Session);
    });

    expect(snapshots).toHaveLength(countAfterSignIn);
    expect(snapshots.at(-1)).toBe(settledContext);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("avoids redundant SecureStore reads in setSignedInAccount when the same account is re-applied", async () => {
    let viewState: ReturnType<typeof useAccountLink> | null = null;
    function AccountProbe() {
      viewState = useAccountLink();
      return null;
    }

    await act(async () => {
      render(<AccountProbe />);
      setSignedInAccount({ id: "user-1", email: "user@example.com" });
    });
    await waitFor(() => expect(viewState?.needsChoice).toBe(true));
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      setSignedInAccount({ id: "user-1", email: "user@example.com" });
    });
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent forced and expiring token refreshes", async () => {
    let resolveRefresh!: (value: { data: { session: Session | null }; error: null }) => void;
    mockAuth.refreshSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }) as never,
    );
    const latest = await renderSignedInSession();

    const p1 = latest.current!.getAccessToken(true);
    const p2 = latest.current!.getAccessToken(true);
    const p3 = latest.current!.getAccessToken(false);
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);

    resolveRefresh({
      data: {
        session: {
          access_token: "refreshed-token",
          refresh_token: "refresh-2",
          user: { id: "real-user-id", email: "user@example.com" } as any,
        } as Session,
      },
      error: null,
    });

    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([
      "refreshed-token",
      "refreshed-token",
      "refreshed-token",
    ]);

    // A later force refresh after settle runs a new refreshSession call.
    mockAuth.refreshSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "refreshed-token-2",
          refresh_token: "refresh-3",
          user: { id: "real-user-id", email: "user@example.com" } as any,
        } as Session,
      },
      error: null,
    } as never);
    await expect(latest.current!.getAccessToken(true)).resolves.toBe("refreshed-token-2");
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("falls back to local sign-out when global revocation hangs past the timeout", async () => {
    const latest = await renderSignedInSession();
    jest.useFakeTimers();
    try {
      mockAuth.signOut
        .mockImplementationOnce(() => new Promise(() => undefined) as never)
        .mockImplementationOnce(() => {
          mockCurrentSession = null;
          return Promise.resolve({ error: null });
        });

      let done = false;
      const signOutPromise = latest.current!.signOut().then(() => {
        done = true;
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3_000);
        await signOutPromise;
      });

      expect(done).toBe(true);
      expect(mockAuth.signOut).toHaveBeenNthCalledWith(1, { scope: "global" });
      expect(mockAuth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
      expect(latest.current?.status).toBe("signed-out");
    } finally {
      jest.useRealTimers();
    }
  });

  it("checks unique non-guest workspaceSubjects on sign-out and throws UnsyncedChangesError", async () => {
    const latest = await renderSignedInSession();
    (inspectLocalWorkspaceForSignOut as jest.Mock).mockResolvedValueOnce({
      unsyncedOperationCount: 2,
      unresolvedConflictCount: 0,
    });

    await expect(
      latest.current!.signOut({
        workspaceSubjects: [
          "real-user-id",
          "real-user-id#family:fam-1",
          "real-user-id",
          GUEST_SUBJECT,
        ],
      }),
    ).rejects.toThrow(UnsyncedChangesError);

    expect(inspectLocalWorkspaceForSignOut).toHaveBeenCalledWith([
      "real-user-id",
      "real-user-id#family:fam-1",
    ]);
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  describe("offline start", () => {
    const storedSubject = "08060c19-8a55-4046-a2e7-7384808dd81c";

    async function renderWithStartupError(error: Error) {
      mockStoredSubject = storedSubject;
      // auth-js reports the failed startup refresh twice: from getSession() and
      // as an INITIAL_SESSION event carrying null.
      mockAuth.onAuthStateChange.mockImplementation((callback) => {
        setTimeout(() => callback("INITIAL_SESSION", null), 0);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      });
      mockAuth.getSession.mockImplementation(() =>
        Promise.resolve({ data: { session: null }, error } as never),
      );
      const latest: { current: ReturnType<typeof useSessionSnapshot> | null } = { current: null };
      await act(async () => {
        render(
          <SessionProvider>
            <TestConsumer onSnapshot={(snap) => (latest.current = snap)} />
          </SessionProvider>,
        );
      });
      // Let the INITIAL_SESSION event land after getSession() has settled.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      return latest;
    }

    it("keeps the stored user signed in when the token refresh cannot reach Supabase", async () => {
      const latest = await renderWithStartupError(
        new AuthRetryableFetchError("Network request failed", 0),
      );

      expect(latest.current?.status).toBe("signed-in");
      expect(latest.current?.subject).toBe(storedSubject);
    });

    it("signs out when Supabase rejects the stored refresh token", async () => {
      const latest = await renderWithStartupError(
        new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
      );

      expect(latest.current?.status).toBe("signed-out");
      expect(latest.current?.subject).toBeNull();
    });
  });

  describe("guest use without an account", () => {
    async function renderSession() {
      const latest = { current: null as ReturnType<typeof useSessionSnapshot> | null };
      await act(async () => {
        render(
          <SessionProvider>
            <TestConsumer onSnapshot={(snap) => (latest.current = snap)} />
          </SessionProvider>,
        );
      });
      return latest;
    }

    it("starts signed out and enters guest use only when the user chooses it", async () => {
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-out"));

      await act(async () => {
        await latest.current!.continueAsGuest();
      });

      expect(latest.current?.status).toBe("guest");
      expect(latest.current?.subject).toBe(GUEST_SUBJECT);
      expect(mockSecureValues.has(GUEST_STORAGE_KEY)).toBe(true);
    });

    it("resumes guest use on the next launch while no account session exists", async () => {
      mockSecureValues.set(GUEST_STORAGE_KEY, "1");

      const latest = await renderSession();

      await waitFor(() => expect(latest.current?.status).toBe("guest"));
      expect(latest.current?.subject).toBe(GUEST_SUBJECT);
    });

    it("never hands a guest an access token", async () => {
      mockSecureValues.set(GUEST_STORAGE_KEY, "1");
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("guest"));

      await expect(latest.current!.getAccessToken(false)).rejects.toThrow(
        "Sign in to use this feature.",
      );
      expect(mockAuth.refreshSession).not.toHaveBeenCalled();
    });

    it("prefers a stored account session over the guest choice and ends guest use", async () => {
      mockSecureValues.set(GUEST_STORAGE_KEY, "1");
      mockCurrentSession = {
        access_token: "real-token",
        refresh_token: "refresh-token",
        user: { id: "real-user-id", email: "user@example.com" } as any,
      } as Session;

      const latest = await renderSession();

      await waitFor(() => expect(latest.current?.status).toBe("signed-in"));
      expect(latest.current?.subject).toBe("real-user-id");
      expect(mockSecureValues.has(GUEST_STORAGE_KEY)).toBe(false);
    });
  });

  describe("android session lifetime", () => {
    const originalOs = Platform.OS;
    const account = {
      access_token: "real-token",
      refresh_token: "refresh-token",
      user: { id: "real-user-id", email: "user@example.com" },
    } as Session;

    beforeEach(() => {
      Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
      mockReadDeviceBootCount.mockReset().mockResolvedValue(4);
    });

    afterEach(() => {
      Object.defineProperty(Platform, "OS", { configurable: true, value: originalOs });
    });

    async function renderSession() {
      const latest = { current: null as ReturnType<typeof useSessionSnapshot> | null };
      await act(async () => {
        render(
          <SessionProvider>
            <TestConsumer onSnapshot={(snap) => (latest.current = snap)} />
          </SessionProvider>,
        );
      });
      return latest;
    }

    it("stays signed in on the same boot and records the boot the first time", async () => {
      mockCurrentSession = account;
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-in"));
      expect(latest.current?.subject).toBe("real-user-id");
      expect(mockAuth.signOut).not.toHaveBeenCalled();
      await waitFor(() => expect(mockSecureValues.get(ANDROID_BOOT_COUNT_KEY)).toBe("4"));
    });

    it("signs out locally after the phone restarts without deleting the workspace", async () => {
      mockSecureValues.set(ANDROID_BOOT_COUNT_KEY, "3");
      mockCurrentSession = account;
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-out"));
      expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
      expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(discardLocalWorkspace).not.toHaveBeenCalled();
      expect(mockSecureValues.has(ANDROID_BOOT_COUNT_KEY)).toBe(false);
    });

    it("stays signed in when Supabase rejects the stored refresh token", async () => {
      mockStoredSubject = "08060c19-8a55-4046-a2e7-7384808dd81c";
      mockAuth.getSession.mockImplementation(() =>
        Promise.resolve({
          data: { session: null },
          error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
        } as never),
      );
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-in"));
      expect(latest.current?.subject).toBe(mockStoredSubject);
    });

    it("ignores a SIGNED_OUT event the user did not ask for", async () => {
      let onAuth: ((event: string, session: Session | null) => void) | null = null;
      mockAuth.onAuthStateChange.mockImplementation((callback) => {
        onAuth = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      });
      mockCurrentSession = account;
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-in"));

      await act(async () => {
        onAuth?.("SIGNED_OUT", null);
      });
      expect(latest.current?.status).toBe("signed-in");
      expect(latest.current?.subject).toBe("real-user-id");
    });

    it("still signs out when the user asks", async () => {
      mockSecureValues.set(ANDROID_BOOT_COUNT_KEY, "4");
      mockCurrentSession = account;
      const latest = await renderSession();
      await waitFor(() => expect(latest.current?.status).toBe("signed-in"));

      await act(async () => {
        await latest.current!.signOut();
      });
      expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "global" });
      expect(latest.current?.status).toBe("signed-out");
      expect(mockSecureValues.has(ANDROID_BOOT_COUNT_KEY)).toBe(false);
    });
  });

  it("keeps the session context reference stable when TOKEN_REFRESHED repeats the same subject", async () => {
    let onAuth: ((event: string, session: Session | null) => void) | null = null;
    mockAuth.onAuthStateChange.mockImplementation((callback) => {
      onAuth = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    mockCurrentSession = {
      access_token: "token-1",
      refresh_token: "refresh-1",
      user: { id: "real-user-id", email: "user@example.com" } as Session["user"],
    } as Session;

    const snapshots: Array<ReturnType<typeof useSessionSnapshot>> = [];
    await act(async () => {
      render(
        <SessionProvider>
          <TestConsumer onSnapshot={(snap) => snapshots.push(snap)} />
        </SessionProvider>,
      );
    });
    await waitFor(() => expect(snapshots.at(-1)?.status).toBe("signed-in"));
    const signedInSnap = snapshots.at(-1);
    const countBeforeRefresh = snapshots.length;

    await act(async () => {
      onAuth?.("TOKEN_REFRESHED", {
        ...mockCurrentSession!,
        access_token: "token-2",
      });
    });

    expect(snapshots).toHaveLength(countBeforeRefresh);
    expect(snapshots.at(-1)).toBe(signedInSnap);
  });

  it("does not clobber a newer session if signOut finishes workspace cleanup afterwards", async () => {
    let onAuth: ((event: string, session: Session | null) => void) | null = null;
    mockAuth.onAuthStateChange.mockImplementation((callback) => {
      onAuth = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    let releaseDiscard!: () => void;
    (discardLocalWorkspace as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseDiscard = resolve;
        }),
    );
    mockAuth.signOut.mockImplementationOnce(() => {
      mockCurrentSession = null;
      onAuth?.("SIGNED_OUT", null);
      return Promise.resolve({ error: null });
    });

    const latest = await renderSignedInSession();
    let signOutPromise!: Promise<void>;
    await act(async () => {
      signOutPromise = latest.current!.signOut();
    });
    await waitFor(() => expect(discardLocalWorkspace).toHaveBeenCalledWith("real-user-id"));

    await act(async () => {
      onAuth?.("SIGNED_IN", {
        access_token: "next-token",
        refresh_token: "next-refresh",
        user: { id: "next-user-id", email: "next@example.com" } as Session["user"],
      } as Session);
    });
    expect(latest.current?.status).toBe("signed-in");
    expect(latest.current?.subject).toBe("next-user-id");

    await act(async () => {
      releaseDiscard();
      await signOutPromise;
    });

    expect(latest.current?.status).toBe("signed-in");
    expect(latest.current?.subject).toBe("next-user-id");
  });
});
