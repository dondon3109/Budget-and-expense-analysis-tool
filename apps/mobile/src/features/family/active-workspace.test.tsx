import { useNetInfo } from "@react-native-community/netinfo";
import { act, render, waitFor } from "@testing-library/react-native";
import { useCallback } from "react";

import { getFamilyDetail } from "@/api/family";
import { listWorkspaces } from "@/api/workspaces";
import { useSessionSnapshot, type SessionContextValue } from "@/auth/session-state";

import { ActiveWorkspaceProvider, useActiveWorkspace } from "./active-workspace";
import {
  EMPTY_WORKSPACE_RECORD,
  loadWorkspaceRecord,
  saveWorkspaceRecord,
  type WorkspaceRecord,
} from "./workspace-record";

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: jest.fn(),
}));
jest.mock("@/api/workspaces", () => ({
  listWorkspaces: jest.fn(),
}));
jest.mock("@/api/family", () => ({
  getFamilyDetail: jest.fn(),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: jest.fn(),
}));
jest.mock("@/db/workspace", () => ({
  discardLocalWorkspace: jest.fn(async () => undefined),
}));
jest.mock("./workspace-record", () => ({
  ...jest.requireActual("./workspace-record"),
  loadWorkspaceRecord: jest.fn(),
  saveWorkspaceRecord: jest.fn(async () => undefined),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ActiveWorkspaceProvider", () => {
  let latest: ReturnType<typeof useActiveWorkspace>;
  const Probe = () => {
    latest = useActiveWorkspace();
    return null;
  };

  const stableGetAccessToken = jest.fn(async () => "token");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    } as ReturnType<typeof useNetInfo>);
    jest.mocked(useSessionSnapshot).mockReturnValue({
      status: "signed-in",
      subject: "user-1",
      getAccessToken: stableGetAccessToken,
    } as unknown as SessionContextValue);
    jest.mocked(loadWorkspaceRecord).mockResolvedValue({
      ...EMPTY_WORKSPACE_RECORD,
      active: "family-1",
      families: [{ id: "family-1", kind: "family", name: "Home", role: "owner" }],
      synced: ["family-1"],
    });
    jest.mocked(listWorkspaces).mockResolvedValue({
      workspaces: [
        { id: "user-1", kind: "user", name: "Personal", role: "owner" },
        { id: "family-1", kind: "family", name: "Home", role: "owner" },
      ],
      familiesAvailable: true,
    });
    jest.mocked(getFamilyDetail).mockResolvedValue({
      id: "family-1",
      name: "Home",
      role: "owner",
      plan: "active",
      seats: { limit: 5, used: 1, cooling: 0 },
      swaps: { limit: 2, used: 0 },
      closesAt: null,
      members: [],
      invitations: [],
    });
  });

  it("loads local workspace record immediately while disabled and refreshes only once enabled", async () => {
    const view = await render(
      <ActiveWorkspaceProvider subject="user-1" enabled={false}>
        <Probe />
      </ActiveWorkspaceProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("ready"));
    expect(latest.workspaceSubject).toBe("user-1#family:family-1");
    expect(listWorkspaces).not.toHaveBeenCalled();
    expect(getFamilyDetail).not.toHaveBeenCalled();

    await view.rerender(
      <ActiveWorkspaceProvider subject="user-1" enabled={true}>
        <Probe />
      </ActiveWorkspaceProvider>,
    );

    await waitFor(() => expect(listWorkspaces).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getFamilyDetail).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceRecord).not.toHaveBeenCalled();
  });

  it("skips listWorkspaces while offline and refreshes on offline -> online transition", async () => {
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    } as ReturnType<typeof useNetInfo>);

    const view = await render(
      <ActiveWorkspaceProvider subject="user-1" enabled={true}>
        <Probe />
      </ActiveWorkspaceProvider>,
    );

    await waitFor(() => expect(latest.status).toBe("ready"));
    expect(listWorkspaces).not.toHaveBeenCalled();
    expect(getFamilyDetail).not.toHaveBeenCalled();

    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    } as ReturnType<typeof useNetInfo>);

    await view.rerender(
      <ActiveWorkspaceProvider subject="user-1" enabled={true}>
        <Probe />
      </ActiveWorkspaceProvider>,
    );

    await waitFor(() => expect(listWorkspaces).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getFamilyDetail).toHaveBeenCalledTimes(1));
  });

  it("does not re-fetch when only the outer session wrapper object changes", async () => {
    function Wrapper({ tick }: { tick: number }) {
      const getAccessToken = useCallback(stableGetAccessToken, []);
      jest.mocked(useSessionSnapshot).mockReturnValue({
        status: "signed-in",
        subject: "user-1",
        getAccessToken,
        extraTick: tick,
      } as unknown as SessionContextValue);
      return (
        <ActiveWorkspaceProvider subject="user-1" enabled={true}>
          <Probe />
        </ActiveWorkspaceProvider>
      );
    }

    const view = await render(<Wrapper tick={1} />);
    await waitFor(() => expect(listWorkspaces).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getFamilyDetail).toHaveBeenCalledTimes(1));

    await act(async () => {
      await view.rerender(<Wrapper tick={2} />);
    });

    expect(listWorkspaces).toHaveBeenCalledTimes(1);
    expect(getFamilyDetail).toHaveBeenCalledTimes(1);
  });

  it("drops the previous subject's ready state synchronously when subject changes", async () => {
    const observed: Array<{ status: string; workspaceSubject: string }> = [];
    const TrackingProbe = () => {
      const active = useActiveWorkspace();
      observed.push({ status: active.status, workspaceSubject: active.workspaceSubject });
      return null;
    };
    const nextLoad = deferred<WorkspaceRecord>();
    jest.mocked(listWorkspaces).mockResolvedValue({ workspaces: [], familiesAvailable: true });
    jest
      .mocked(loadWorkspaceRecord)
      .mockResolvedValueOnce(EMPTY_WORKSPACE_RECORD)
      .mockReturnValueOnce(nextLoad.promise);

    const view = await render(
      <ActiveWorkspaceProvider subject="zoption-guest">
        <TrackingProbe />
      </ActiveWorkspaceProvider>,
    );
    expect(observed.at(-1)).toEqual({ status: "ready", workspaceSubject: "zoption-guest" });
    observed.length = 0;

    await view.rerender(
      <ActiveWorkspaceProvider subject="user-1">
        <TrackingProbe />
      </ActiveWorkspaceProvider>,
    );
    // Must transition to loading on the very first render under user-1 so LocalWorkspaceProvider
    // never keeps the guest workspace open for the new signed-in session.
    expect(observed[0]).toEqual({ status: "loading", workspaceSubject: "user-1" });

    await act(async () => nextLoad.resolve(EMPTY_WORKSPACE_RECORD));
    expect(observed.at(-1)).toEqual({ status: "ready", workspaceSubject: "user-1" });
  });
});
