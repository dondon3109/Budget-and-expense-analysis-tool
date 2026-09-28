import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import { AuthenticatedGate } from "./authenticated-layout";

// The authenticated group must wait out the session restore instead of
// redirecting: a deep link that opens the app cold (the home-screen mic
// widget's widget-intent link) arrives before the stored session resolves, and
// a redirect at that moment discards the route and its params.

jest.mock("expo-router", () => ({
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/auth/worker-identity-state", () => ({ useWorkerIdentity: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({
  LocalWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocalWorkspace: jest.fn(),
}));
jest.mock("@/features/reminders/daily-reminder", () => ({ DailyReminderTapHandler: () => null }));
jest.mock("@/sync/sync-state", () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Stands in for the route Stack the layout passes as children.
const workspaceRoutes = <Text>Workspace routes</Text>;

// The layout only reads status/subject; the provider value carries far more.
const session = (snapshot: {
  status: SessionContextValue["status"];
  subject: string | null;
}): SessionContextValue => snapshot as SessionContextValue;

describe("authenticated layout session gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useWorkerIdentity).mockReturnValue({
      status: "verified",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: null,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
  });

  it("holds a deep-linked route while the stored session is still loading", async () => {
    jest.mocked(useSessionSnapshot).mockReturnValue(session({ status: "loading", subject: null }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    // Redirecting here is what dropped the widget's payload and transcript.
    expect(screen.getByText("Restoring your session…")).toBeTruthy();
    expect(screen.queryByText("Workspace routes")).toBeNull();
  });

  it("redirects only once the session has resolved signed-out", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-out", subject: null }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(screen.queryByText("Restoring your session…")).toBeNull();
    expect(screen.queryByText("Workspace routes")).toBeNull();
  });

  it("renders the authenticated workspace once signed in", async () => {
    jest
      .mocked(useSessionSnapshot)
      .mockReturnValue(session({ status: "signed-in", subject: "user-1" }));

    await render(<AuthenticatedGate>{workspaceRoutes}</AuthenticatedGate>);

    expect(screen.queryByText("Restoring your session…")).toBeNull();
    expect(await screen.findByText("Workspace routes")).toBeTruthy();
  });
});
