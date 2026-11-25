import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Platform, Text } from "react-native";

import { WorkerIdentityError } from "@/api/worker-identity";

const mockGetAccessToken = jest.fn(async () => "token");
const mockSignOut = jest.fn(async () => undefined);
const mockVerifyWorkerIdentity = jest.fn();
let mockSession = {
  status: "signed-in" as "loading" | "signed-out" | "signed-in" | "guest",
  subject: "08060c19-8a55-4046-a2e7-7384808dd81c" as string | null,
};

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
}));

jest.mock("./session-state", () => ({
  useSessionSnapshot: () => ({
    getAccessToken: mockGetAccessToken,
    signOut: mockSignOut,
    ...mockSession,
  }),
}));

jest.mock("@/api/worker-identity", () => ({
  ...jest.requireActual("@/api/worker-identity"),
  verifyWorkerIdentity: (...args: unknown[]) => mockVerifyWorkerIdentity(...args),
}));

import { WorkerIdentityProvider, useWorkerIdentity } from "./worker-identity-state";

function Probe() {
  const identity = useWorkerIdentity();
  return <Text>{`${identity.status}:${identity.message ?? ""}`}</Text>;
}

describe("worker identity on Android", () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    mockSignOut.mockClear();
    mockVerifyWorkerIdentity.mockReset();
    jest
      .mocked(NetInfo.addEventListener)
      .mockReset()
      .mockImplementation(() => () => undefined);
    mockSession = {
      status: "signed-in",
      subject: "08060c19-8a55-4046-a2e7-7384808dd81c",
    };
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOs });
  });

  it("drops a verified status synchronously when the signed-in subject changes", async () => {
    const observed: string[] = [];
    function TrackingProbe() {
      const identity = useWorkerIdentity();
      observed.push(identity.status);
      return null;
    }
    mockVerifyWorkerIdentity
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(new Promise(() => undefined));

    const view = await render(
      <WorkerIdentityProvider>
        <TrackingProbe />
      </WorkerIdentityProvider>,
    );
    await waitFor(() => expect(observed.at(-1)).toBe("verified"));
    observed.length = 0;

    mockSession = { status: "signed-in", subject: "user-2" };
    await view.rerender(
      <WorkerIdentityProvider>
        <TrackingProbe />
      </WorkerIdentityProvider>,
    );
    expect(observed[0]).toBe("checking");
  });

  it("keeps the session when the access token is expired", async () => {
    mockVerifyWorkerIdentity.mockRejectedValue(
      new WorkerIdentityError("expired", "session_expired", 401),
    );

    await act(async () => {
      render(
        <WorkerIdentityProvider>
          <Probe />
        </WorkerIdentityProvider>,
      );
    });

    await waitFor(() => expect(screen.getByText(/You're still signed in/)).toBeTruthy());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out when the account was deleted", async () => {
    mockVerifyWorkerIdentity.mockRejectedValue(
      new WorkerIdentityError("deleted", "account_deleted", 410),
    );

    await act(async () => {
      render(
        <WorkerIdentityProvider>
          <Probe />
        </WorkerIdentityProvider>,
      );
    });

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ preserveLocalWorkspace: true }));
  });

  it("retries offline launch failures on the first NetInfo null -> true transition without looping", async () => {
    let listener: ((state: NetInfoState) => void) | undefined;
    jest.mocked(NetInfo.addEventListener).mockImplementation((cb) => {
      listener = cb;
      return () => undefined;
    });
    mockVerifyWorkerIdentity
      .mockRejectedValueOnce(new AuthRetryableFetchError("Network request failed", 0))
      .mockRejectedValueOnce(new WorkerIdentityError("Offline", "unreachable", 0))
      .mockResolvedValueOnce(undefined);

    await render(
      <WorkerIdentityProvider>
        <Probe />
      </WorkerIdentityProvider>,
    );

    await waitFor(() => expect(screen.getByText(/You're offline\./)).toBeTruthy());
    expect(mockVerifyWorkerIdentity).toHaveBeenCalledTimes(1);

    // First NetInfo event arrives as reachable: true directly from wasReachable === null.
    await act(async () => {
      listener?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    await waitFor(() => expect(mockVerifyWorkerIdentity).toHaveBeenCalledTimes(2));

    // A second reachable: true event without dropping offline must not spin in a loop.
    await act(async () => {
      listener?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    expect(mockVerifyWorkerIdentity).toHaveBeenCalledTimes(2);

    // Dropping offline then reconnecting triggers the next retry cleanly.
    await act(async () => {
      listener?.({ isConnected: false, isInternetReachable: false } as NetInfoState);
      listener?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    await waitFor(() => expect(screen.getByText("verified:")).toBeTruthy());
    expect(mockVerifyWorkerIdentity).toHaveBeenCalledTimes(3);
  });

  it("does not tight-loop on an already-online 5xx server error", async () => {
    let listener: ((state: NetInfoState) => void) | undefined;
    jest.mocked(NetInfo.addEventListener).mockImplementation((cb) => {
      listener = cb;
      return () => undefined;
    });
    mockVerifyWorkerIdentity.mockRejectedValue(
      new WorkerIdentityError("Service unavailable", "unreachable", 503),
    );

    await render(
      <WorkerIdentityProvider>
        <Probe />
      </WorkerIdentityProvider>,
    );

    await waitFor(() => expect(screen.getByText("error:Service unavailable")).toBeTruthy());
    await act(async () => {
      listener?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    expect(mockVerifyWorkerIdentity).toHaveBeenCalledTimes(1);
  });
});
