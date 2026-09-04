import { render, waitFor, act } from "@testing-library/react-native";
import React, { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";

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
  getSession: jest.fn(() => Promise.resolve({ data: { session: mockCurrentSession }, error: null })),
  refreshSession: jest.fn(() => Promise.resolve({ data: { session: mockCurrentSession }, error: null })),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  signOut: jest.fn(() => {
    mockCurrentSession = null;
    return Promise.resolve({ error: null });
  }),
};

jest.mock("./supabase-client", () => ({
  get supabase() {
    return { auth: mockAuth };
  },
  getSupabaseClient() {
    return { auth: mockAuth };
  },
}));

jest.mock("@/db/workspace", () => ({
  discardLocalWorkspace: jest.fn(() => Promise.resolve()),
  inspectLocalWorkspaceForSignOut: jest.fn(() =>
    Promise.resolve({ unsyncedOperationCount: 0, unresolvedConflictCount: 0 }),
  ),
}));

import {
  DUMMY_DEV_STORAGE_KEY,
  DUMMY_DEV_SUBJECT,
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
    mockDevelopmentVariant = false;
    mockCurrentSession = null;
    mockAuth.onAuthStateChange.mockReset().mockImplementation((_callback) => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    }));
    mockAuth.getSession.mockReset().mockImplementation(() =>
      Promise.resolve({ data: { session: mockCurrentSession }, error: null }),
    );
    mockAuth.refreshSession.mockReset().mockImplementation(() =>
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
});
