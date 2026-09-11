import { render, screen } from "@testing-library/react-native";

import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { useLocalWorkspace } from "@/db/local-workspace-state";
import AuthenticatedLayout from "../../app/(app)/_layout";

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
jest.mock("@/sync/sync-state", () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

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

    await render(<AuthenticatedLayout />);

    // Redirecting here is what dropped the widget's payload and transcript.
    expect(screen.getByText("Restoring your session…")).toBeTruthy();
  });

  it("redirects only once the session has resolved signed-out", async () => {
    jest.mocked(useSessionSnapshot).mockReturnValue(session({ status: "signed-out", subject: null }));

    await render(<AuthenticatedLayout />);

    expect(screen.queryByText("Restoring your session…")).toBeNull();
  });

  it("renders the authenticated workspace once signed in", async () => {
    jest.mocked(useSessionSnapshot).mockReturnValue(session({ status: "signed-in", subject: "user-1" }));

    await render(<AuthenticatedLayout />);

    expect(screen.queryByText("Restoring your session…")).toBeNull();
  });
});