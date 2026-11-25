import { act, render } from "@testing-library/react-native";

import { LocalWorkspaceProvider, useLocalWorkspace } from "./local-workspace-state";
import { closeLocalWorkspace, openLocalWorkspace, type LocalWorkspace } from "./workspace";

jest.mock("./workspace", () => ({
  openLocalWorkspace: jest.fn(),
  closeLocalWorkspace: jest.fn(async () => undefined),
  describeWorkspaceOpenFailure: () => "The encrypted local workspace could not be opened.",
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const first = { databaseName: "first" } as LocalWorkspace;
const rebuilt = { databaseName: "rebuilt" } as LocalWorkspace;

describe("LocalWorkspaceProvider", () => {
  let latest: ReturnType<typeof useLocalWorkspace>;
  const Probe = () => {
    latest = useLocalWorkspace();
    return null;
  };

  beforeEach(() => {
    jest.mocked(openLocalWorkspace).mockReset();
    jest.mocked(closeLocalWorkspace).mockClear();
  });

  // A recovery rebuilds the file and reopens it. Dropping back to "opening" would make the
  // authenticated gate show the full-screen loader and remount navigation on Home.
  it("keeps the shown workspace ready and open while a reopen of the same file is pending", async () => {
    const reopened = deferred<LocalWorkspace>();
    jest
      .mocked(openLocalWorkspace)
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(reopened.promise);
    const view = await render(
      <LocalWorkspaceProvider subject="user-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );
    expect(latest).toMatchObject({ status: "ready", workspace: first });

    await act(async () => latest.reopen());
    expect(latest).toMatchObject({ status: "ready", workspace: first });
    expect(closeLocalWorkspace).not.toHaveBeenCalled();

    await act(async () => reopened.resolve(rebuilt));
    expect(latest).toMatchObject({ status: "ready", workspace: rebuilt });
    expect(closeLocalWorkspace).not.toHaveBeenCalled();

    await view.unmount();
    expect(closeLocalWorkspace).toHaveBeenCalledWith("user-1", expect.any(Symbol));
  });

  it("shows opening again and closes the prior subject for a different workspace", async () => {
    const family = deferred<LocalWorkspace>();
    jest
      .mocked(openLocalWorkspace)
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(family.promise);
    const view = await render(
      <LocalWorkspaceProvider subject="user-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );
    expect(latest.status).toBe("ready");

    await view.rerender(
      <LocalWorkspaceProvider subject="user-1:family-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );
    expect(closeLocalWorkspace).toHaveBeenCalledWith("user-1", expect.any(Symbol));
    expect(latest).toMatchObject({ status: "opening", workspace: null });
    await act(async () => family.resolve(rebuilt));
    expect(latest).toMatchObject({ status: "ready", workspace: rebuilt });
  });

  it("hides the previous workspace synchronously on the render a new subject arrives", async () => {
    const observed: Array<{ status: string; workspace: LocalWorkspace | null }> = [];
    const TrackingProbe = () => {
      const value = useLocalWorkspace();
      observed.push({ status: value.status, workspace: value.workspace });
      return null;
    };
    const next = deferred<LocalWorkspace>();
    jest.mocked(openLocalWorkspace).mockResolvedValueOnce(first).mockReturnValueOnce(next.promise);
    const view = await render(
      <LocalWorkspaceProvider subject="zoption-guest">
        <TrackingProbe />
      </LocalWorkspaceProvider>,
    );
    observed.length = 0;

    await view.rerender(
      <LocalWorkspaceProvider subject="user-1">
        <TrackingProbe />
      </LocalWorkspaceProvider>,
    );
    // The very first render under the new subject must never expose the guest workspace.
    expect(observed[0]).toEqual({ status: "opening", workspace: null });
    await act(async () => next.resolve(rebuilt));
    expect(observed.at(-1)).toEqual({ status: "ready", workspace: rebuilt });
  });

  it("passes distinct leases for overlapping mounts and releases only the unmounting lease", async () => {
    jest.mocked(openLocalWorkspace).mockResolvedValue(first);

    const firstMount = await render(
      <LocalWorkspaceProvider subject="user-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );
    const secondMount = await render(
      <LocalWorkspaceProvider subject="user-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );

    const [firstCall, secondCall] = jest.mocked(openLocalWorkspace).mock.calls;
    expect(typeof firstCall?.[1]).toBe("symbol");
    expect(typeof secondCall?.[1]).toBe("symbol");
    expect(firstCall?.[1]).not.toBe(secondCall?.[1]);

    await firstMount.unmount();
    expect(closeLocalWorkspace).toHaveBeenCalledWith("user-1", firstCall?.[1]);
    expect(closeLocalWorkspace).not.toHaveBeenCalledWith("user-1", secondCall?.[1]);

    await secondMount.unmount();
    expect(closeLocalWorkspace).toHaveBeenCalledWith("user-1", secondCall?.[1]);
  });

  it("ignores duplicate reopen calls while a reopen for the same subject is already pending", async () => {
    const reopened = deferred<LocalWorkspace>();
    jest
      .mocked(openLocalWorkspace)
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(reopened.promise);

    await render(
      <LocalWorkspaceProvider subject="user-1">
        <Probe />
      </LocalWorkspaceProvider>,
    );
    expect(openLocalWorkspace).toHaveBeenCalledTimes(1);

    await act(async () => {
      latest.reopen();
      latest.reopen();
    });
    expect(openLocalWorkspace).toHaveBeenCalledTimes(2);

    await act(async () => reopened.resolve(rebuilt));
    expect(latest).toMatchObject({ status: "ready", workspace: rebuilt });
  });
});
