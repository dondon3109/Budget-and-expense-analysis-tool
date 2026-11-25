import { fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";

import { useGoalProfileSync } from "@/auth/goal-profile-sync";
import { usePetSync } from "@/auth/pet-sync";
import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { useWorkspaceCurrencySync } from "@/auth/workspace-currency-sync";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { usePushRegistration } from "@/features/push/use-push-registration";
import { useSyncState } from "@/sync/sync-state";
import { AuthenticatedGate } from "./authenticated-layout";

// The authenticated group must wait out the session restore instead of
// redirecting: a deep link that opens the app cold (the home-screen mic
// widget's widget-intent link) arrives before the stored session resolves, and
// a redirect at that moment discards the route and its params.

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
}));
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/auth/worker-identity-state", () => ({ useWorkerIdentity: jest.fn() }));
jest.mock("@/auth/workspace-currency-sync", () => ({ useWorkspaceCurrencySync: jest.fn() }));
jest.mock("@/auth/goal-profile-sync", () => ({ useGoalProfileSync: jest.fn() }));
jest.mock("@/auth/pet-sync", () => ({ usePetSync: jest.fn() }));
jest.mock("@/features/push/use-push-registration", () => ({ usePushRegistration: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({
  LocalWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocalWorkspace: jest.fn(),
}));
jest.mock("@/features/family/active-workspace", () => ({
  ActiveWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useActiveWorkspace: jest.fn(),
}));
jest.mock("@/features/reminders/daily-reminder", () => ({ DailyReminderTapHandler: () => null }));
jest.mock("@/features/family/family-push-tap", () => ({ FamilyPushTapHandler: () => null }));
jest.mock("@/features/subscriptions/subscription-push-tap", () => ({
  SubscriptionPushTapHandler: () => null,
}));
jest.mock("@/features/receipts/SharedReceiptHandoff", () => ({ SharedReceiptHandoff: () => null }));
jest.mock("@/features/billing/PlanLimitDialog", () => ({
  PlanLimitHost: () => null,
  usePlanLimitOpen: () => false,
}));
jest.mock("@/telemetry/screen-viewed", () => ({ ScreenViewedTracker: () => null }));
jest.mock("@/sync/sync-state", () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => children,
  useSyncState: jest.fn(),
}));

// Stands in for the route Stack the layout passes as children.
const workspaceRoutes = <Text>Workspace routes</Text>;

// The layout only reads status/subject; the provider value carries far more.
const session = (snapshot: {
  status: SessionContextValue["status"];
  subject: string | null;
  signOut?: SessionContextValue["signOut"];
}): SessionContextValue =>
  ({ signOut: jest.fn(async () => undefined), ...snapshot }) as SessionContextValue;

const personalActive = {
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
};

describe("authenticated layout session gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useActiveWorkspace).mockReturnValue(personalActive);
    jest.mocked(useWorkerIdentity).mockReturnValue({
      status: "verified",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { hasSynced: true } as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
      hasSynced: true,
      offline: false,
    });
  });

  it("holds a deep-linked route while the stored session is still loading", async () => {
    jest.mocked(useSessionSnapshot).mockReturnValue(session({ status: "loading", subject: null }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    // Redirecting here is what dropped the widget's payload and transcript.
    expect(screen.getByLabelText("Restoring your session")).toBeTruthy();
    expect(screen.queryByText("Workspace routes")).toBeNull();
  });

  it("redirects only once the session has resolved signed-out", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-out", subject: null }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(screen.queryByLabelText("Restoring your session")).toBeNull();
    expect(screen.queryByText("Workspace routes")).toBeNull();
  });

  it("renders the authenticated workspace once signed in", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(screen.queryByLabelText("Restoring your session")).toBeNull();
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
  });

  it("opens the local workspace for a guest without an account", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "guest", subject: "zoption-guest" }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(await screen.findByText("Workspace routes")).toBeTruthy();
  });

  it("keeps the loading screen up on a fresh workspace until its first sync finishes", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { hasSynced: false } as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useSyncState).mockReturnValue({
      status: "waiting",
      message: null,
      retry: jest.fn(),
      hasSynced: false,
      offline: false,
    });

    const view = await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    // Identity check and initial pull stay behind the shared loading screen.
    expect(screen.getByLabelText("Syncing your workspace")).toBeTruthy();
    expect(screen.queryByText("Workspace routes")).toBeNull();

    jest.mocked(useSyncState).mockReturnValue({
      status: "syncing",
      message: null,
      retry: jest.fn(),
      hasSynced: false,
      offline: false,
    });
    await view.rerender(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(screen.getByLabelText("Syncing your workspace")).toBeTruthy();
    expect(screen.queryByText("Workspace routes")).toBeNull();

    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
      hasSynced: true,
      offline: false,
    });
    await view.rerender(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(screen.queryByLabelText("Syncing your workspace")).toBeNull();
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
  });

  it("opens an already-synced workspace straight away even when offline", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));
    jest.mocked(useSyncState).mockReturnValue({
      status: "waiting",
      message: "Offline. Showing records already protected on this device.",
      retry: jest.fn(),
      hasSynced: true,
      offline: true,
    });

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(screen.queryByLabelText("Syncing your workspace")).toBeNull();
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
  });

  it("shows a retry screen when a fresh workspace fails its first sync or is offline", async () => {
    const retry = jest.fn();
    const switchTo = jest.fn();
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { hasSynced: false } as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useActiveWorkspace).mockReturnValue({
      ...personalActive,
      family: { id: "family-1", kind: "family", name: "Home", role: "member" },
      workspaceSubject: "user-1:family-1",
      switchTo,
    });
    jest.mocked(useSyncState).mockReturnValue({
      status: "failed",
      message: "The server timed out.",
      retry,
      hasSynced: false,
      offline: false,
    });

    const view = await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(await screen.findByText("Couldn't sync your workspace")).toBeTruthy();
    expect(screen.getByText("The server timed out.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Switch to Personal" }));
    expect(switchTo).toHaveBeenCalledWith(null);

    jest.mocked(useSyncState).mockReturnValue({
      status: "waiting",
      message: "Offline.",
      retry,
      hasSynced: false,
      offline: true,
    });
    await view.rerender(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(await screen.findByText("You're offline")).toBeTruthy();

    // Syncing a fresh family lets the user back out to Personal without waiting.
    jest.mocked(useSyncState).mockReturnValue({
      status: "syncing",
      message: null,
      retry,
      hasSynced: false,
      offline: false,
    });
    await view.rerender(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(screen.getByLabelText("Syncing your workspace")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Switch to Personal" }));
    expect(switchTo).toHaveBeenCalledTimes(2);
  });

  it("offers sign out on a personal workspace when initial sync cannot finish", async () => {
    const signOut = jest.fn(async () => undefined);
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1", signOut }));
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { hasSynced: false } as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useSyncState).mockReturnValue({
      status: "full-resync-required",
      message: "Recovery failed.",
      retry: jest.fn(),
      hasSynced: false,
      offline: false,
    });

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(await screen.findByText("Couldn't sync your workspace")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("gates companion metadata hooks until worker identity is verified", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));
    jest.mocked(useWorkerIdentity).mockReturnValue({
      status: "checking",
      message: null,
      retry: jest.fn(),
    });

    const view = await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(useWorkspaceCurrencySync).toHaveBeenLastCalledWith(false);
    expect(useGoalProfileSync).toHaveBeenLastCalledWith(false);
    expect(usePetSync).toHaveBeenLastCalledWith(false);
    expect(usePushRegistration).toHaveBeenLastCalledWith(false);

    jest.mocked(useWorkerIdentity).mockReturnValue({
      status: "verified",
      message: null,
      retry: jest.fn(),
    });
    await view.rerender(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);
    expect(useWorkspaceCurrencySync).toHaveBeenLastCalledWith(true);
    expect(useGoalProfileSync).toHaveBeenLastCalledWith(true);
    expect(usePetSync).toHaveBeenLastCalledWith(true);
    expect(usePushRegistration).toHaveBeenLastCalledWith(true);
  });

  it("keeps the workspace mounted across guest -> signed-in transitions", async () => {
    let mounts = 0;
    let unmounts = 0;
    function ProbeRoutes() {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <Text>Workspace routes</Text>;
    }

    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "guest", subject: "zoption-guest" }));
    const view = await render(
      <AuthenticatedGate>
        <ProbeRoutes />
      </AuthenticatedGate>,
    );
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));
    await view.rerender(
      <AuthenticatedGate>
        <ProbeRoutes />
      </AuthenticatedGate>,
    );
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });
});
