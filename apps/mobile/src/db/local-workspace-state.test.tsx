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
  it("keeps the shown workspace ready while a reopen of the same file is pending", async () => {
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
    expect(latest).toMatchObject({ status: "ready", workspace: first });

    await act(async () => latest.reopen());
    expect(latest).toMatchObject({ status: "ready", workspace: first });

    await act(async () => reopened.resolve(rebuilt));
    expect(latest).toMatchObject({ status: "ready", workspace: rebuilt });
  });

  it("shows opening again for a different workspace", async () => {
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
    expect(latest).toMatchObject({ status: "opening", workspace: null });
    await act(async () => family.resolve(rebuilt));
    expect(latest).toMatchObject({ status: "ready", workspace: rebuilt });
  });
});
