import { act, render } from "@testing-library/react-native";

import { ActiveWorkspaceProvider, useActiveWorkspace } from "./active-workspace";
import {
  EMPTY_WORKSPACE_RECORD,
  loadWorkspaceRecord,
  type WorkspaceRecord,
} from "./workspace-record";

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-in",
    subject: "user-1",
    getAccessToken: async () => "token",
  }),
}));
jest.mock("@/api/workspaces", () => ({
  listWorkspaces: jest.fn(async () => ({ workspaces: [] })),
}));
jest.mock("@/api/family", () => ({ getFamilyDetail: jest.fn() }));
jest.mock("@/db/workspace", () => ({ discardLocalWorkspace: jest.fn(async () => undefined) }));
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("drops the previous subject's ready state synchronously when subject changes", async () => {
    const observed: Array<{ status: string; workspaceSubject: string }> = [];
    const Probe = () => {
      const active = useActiveWorkspace();
      observed.push({ status: active.status, workspaceSubject: active.workspaceSubject });
      return null;
    };
    const nextLoad = deferred<WorkspaceRecord>();
    jest
      .mocked(loadWorkspaceRecord)
      .mockResolvedValueOnce(EMPTY_WORKSPACE_RECORD)
      .mockReturnValueOnce(nextLoad.promise);

    const view = await render(
      <ActiveWorkspaceProvider subject="zoption-guest">
        <Probe />
      </ActiveWorkspaceProvider>,
    );
    expect(observed.at(-1)).toEqual({ status: "ready", workspaceSubject: "zoption-guest" });
    observed.length = 0;

    await view.rerender(
      <ActiveWorkspaceProvider subject="user-1">
        <Probe />
      </ActiveWorkspaceProvider>,
    );
    // Must transition to loading on the very first render under user-1 so LocalWorkspaceProvider
    // never keeps the guest workspace open for the new signed-in session.
    expect(observed[0]).toEqual({ status: "loading", workspaceSubject: "user-1" });

    await act(async () => nextLoad.resolve(EMPTY_WORKSPACE_RECORD));
    expect(observed.at(-1)).toEqual({ status: "ready", workspaceSubject: "user-1" });
  });
});
