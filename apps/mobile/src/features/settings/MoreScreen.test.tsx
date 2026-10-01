import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MoreScreen } from "./MoreScreen";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { useLocalWorkspaceStats } from "@/db/local-workspace-state";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/auth/plan-state", () => ({
  usePlan: () => ({ plan: "free", status: "ready", retry: jest.fn() }),
}));
jest.mock("@/config/app-variant", () => ({ isDevelopmentAppVariant: jest.fn(() => false) }));
jest.mock("@/db/demo-seed", () => ({ seedDummyWorkspaceData: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: () => ({ workspace: { schemaVersion: 12, database: {} } }),
  useLocalWorkspaceStats: jest.fn(),
}));
jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ status: "synced", message: null, retry: jest.fn() }),
}));
// Both cards own their stores and native modules; this suite covers the screen's own flows.
jest.mock("@/features/settings/PreferenceCards", () => ({ PreferenceCards: () => null }));
jest.mock("@/features/updates", () => ({ UpdateSettingsCard: () => null }));

const signOut = jest.fn<Promise<void>, [{ discardUnsyncedChanges: boolean }]>();

function withLocalChanges(unsyncedOperationCount: number, unresolvedConflictCount: number): void {
  jest.mocked(useLocalWorkspaceStats).mockReturnValue({
    stats: {
      accountCount: 1,
      categoryCount: 1,
      transactionCount: 1,
      unsyncedOperationCount,
      unresolvedConflictCount,
    },
    error: null,
  });
}

describe("MoreScreen sign out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockResolvedValue(undefined);
    jest.mocked(isDevelopmentAppVariant).mockReturnValue(false);
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue({ signOut } as unknown as ReturnType<typeof useSessionSnapshot>);
  });

  it("signs out without discarding when everything is synchronized", async () => {
    withLocalChanges(0, 0);
    await render(<MoreScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByText("Sign out of Zoption?")).toBeTruthy();

    await fireEvent.press(screen.getAllByRole("button", { name: "Sign out" }).at(-1)!);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ discardUnsyncedChanges: false }));
  });

  it("warns and discards when local changes or conflicts are unsynchronized", async () => {
    withLocalChanges(2, 1);
    await render(<MoreScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByText("Discard local changes?")).toBeTruthy();
    expect(screen.getByText(/^3 local changes have not been safely synchronized\./)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Discard and sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ discardUnsyncedChanges: true }));
  });

  it("shows the sign-out failure", async () => {
    withLocalChanges(0, 0);
    signOut.mockRejectedValueOnce(new Error("Network unavailable."));
    await render(<MoreScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "Sign out" }).at(-1)!);

    expect(await screen.findByText("Network unavailable.")).toBeTruthy();
  });

  it("shows the demo data generator only in development builds", async () => {
    withLocalChanges(0, 0);
    const { unmount } = await render(<MoreScreen />);
    expect(screen.queryByText("Demo data")).toBeNull();
    await unmount();

    jest.mocked(isDevelopmentAppVariant).mockReturnValue(true);
    await render(<MoreScreen />);
    expect(screen.getByText("Demo data")).toBeTruthy();
  });
});
