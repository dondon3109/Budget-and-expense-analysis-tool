import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react-native";

import { telemetry } from "@/telemetry/telemetry";

import type { LocalWorkspace } from "../workspace";
import { subscribeToLocalChanges } from "./change-stream";
import { LocalQueryActivity, useLocalQuery, type LocalQueryOptions } from "./use-local-query";

jest.mock("./change-stream", () => ({ subscribeToLocalChanges: jest.fn() }));

const workspace = { databaseName: "workspace-a.db" } as LocalWorkspace;
const NO_ROWS: string[] = [];

let refreshFromTableChange: (() => void) | null = null;
const unsubscribe = jest.fn();

function options(
  read: LocalQueryOptions<string[]>["read"],
  extra: Partial<LocalQueryOptions<string[]>> = {},
): LocalQueryOptions<string[]> {
  return {
    read,
    tables: ["goals", "sync_outbox"],
    empty: NO_ROWS,
    errorMessage: "Goals could not be read.",
    ...extra,
  };
}

describe("useLocalQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refreshFromTableChange = null;
    jest.mocked(subscribeToLocalChanges).mockImplementation((_database, _tables, refresh) => {
      refreshFromTableChange = refresh;
      return unsubscribe;
    });
  });

  it("reads on mount and subscribes to its tables on the workspace database", async () => {
    const read = jest.fn(async () => ["first"]);
    const { result } = await renderHook(() => useLocalQuery(workspace, options(read)));

    expect(result.current.data).toEqual(["first"]);
    expect(result.current.error).toBeNull();
    expect(read).toHaveBeenCalledWith(workspace);
    expect(subscribeToLocalChanges).toHaveBeenCalledWith(
      "workspace-a.db",
      ["goals", "sync_outbox"],
      expect.any(Function),
    );
  });

  it("re-reads when a subscribed table changes", async () => {
    const read = jest.fn(async () => ["first"]);
    const { result } = await renderHook(() => useLocalQuery(workspace, options(read)));

    read.mockResolvedValueOnce(["second"]);
    await act(async () => refreshFromTableChange?.());

    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(["second"]);
  });

  it("keeps the last value and reports the error when a read fails", async () => {
    const read = jest.fn(async () => ["first"]);
    const { result } = await renderHook(() =>
      useLocalQuery(workspace, options(read, { initialLoading: true })),
    );
    expect(result.current.loading).toBe(false);

    read.mockRejectedValueOnce(new Error("disk I/O error"));
    await act(async () => refreshFromTableChange?.());

    expect(result.current.data).toEqual(["first"]);
    expect(result.current.error).toBe("Goals could not be read.");
    expect(result.current.loading).toBe(false);
  });

  it("derives the error text from the cause when given a function", async () => {
    const read = jest.fn(async () => {
      throw new Error("database is locked");
    });
    const messageFor = (cause: unknown) => (cause instanceof Error ? cause.message : "unknown");
    const { result } = await renderHook(() =>
      useLocalQuery(workspace, options(read, { errorMessage: messageFor })),
    );

    expect(result.current.error).toBe("database is locked");
    expect(result.current.data).toBe(NO_ROWS);
  });

  it("clears the error and re-subscribes on retry", async () => {
    const read = jest.fn(async (): Promise<string[]> => {
      throw new Error("busy");
    });
    const { result } = await renderHook(() => useLocalQuery(workspace, options(read)));
    expect(result.current.error).toBe("Goals could not be read.");

    read.mockResolvedValueOnce(["recovered"]);
    await act(async () => result.current.retry());

    expect(result.current.data).toEqual(["recovered"]);
    expect(result.current.error).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeToLocalChanges).toHaveBeenCalledTimes(2);
  });

  it("stays empty without reading while there is no workspace or no reader", async () => {
    const read = jest.fn(async () => ["unexpected"]);
    const noWorkspace = await renderHook(() => useLocalQuery(null, options(read)));
    const noReader = await renderHook(() =>
      useLocalQuery(workspace, options(null, { initialLoading: true })),
    );

    expect(noWorkspace.result.current.data).toBe(NO_ROWS);
    expect(noReader.result.current).toMatchObject({ data: NO_ROWS, loading: false, error: null });
    expect(read).not.toHaveBeenCalled();
    expect(subscribeToLocalChanges).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount and drops a read that settles afterwards", async () => {
    let settle: (rows: string[]) => void = () => undefined;
    const read = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          settle = resolve;
        }),
    );
    const { result, unmount } = await renderHook(() => useLocalQuery(workspace, options(read)));

    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => settle(["late"]));
    expect(result.current.data).toBe(NO_ROWS);
  });

  it("drops an older read that finishes after a newer read", async () => {
    const resolvers: Array<(rows: string[]) => void> = [];
    const read = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = await renderHook(() => useLocalQuery(workspace, options(read)));

    await act(async () => refreshFromTableChange?.());
    expect(resolvers).toHaveLength(2);

    await act(async () => resolvers[1]!([`fresh`]));
    expect(result.current.data).toEqual(["fresh"]);

    await act(async () => resolvers[0]!([`stale`]));
    expect(result.current.data).toEqual(["fresh"]);
  });

  it("defers table-change refreshes while inactive and flushes once active again", async () => {
    const read = jest.fn(async () => ["first"]);
    let active = true;
    const wrapper = ({ children }: PropsWithChildren) => (
      <LocalQueryActivity active={active}>{children}</LocalQueryActivity>
    );
    const { result, rerender } = await renderHook(() => useLocalQuery(workspace, options(read)), {
      wrapper,
    });
    expect(read).toHaveBeenCalledTimes(1);

    active = false;
    await rerender({});

    read.mockResolvedValueOnce(["updated"]);
    await act(async () => {
      refreshFromTableChange?.();
      refreshFromTableChange?.();
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(["first"]);

    active = true;
    await rerender({});
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(["updated"]);
  });

  it("asks to reopen once when a read fails on a closed workspace and recovers on the new handle", async () => {
    const closedWorkspace = { databaseName: "workspace-a.db", closed: true } as LocalWorkspace;
    const freshWorkspace = { databaseName: "workspace-a.db", closed: false } as LocalWorkspace;
    const onClosedWorkspace = jest.fn();
    const captureSpy = jest.spyOn(telemetry, "captureException").mockResolvedValue(undefined);
    const read = jest.fn(async (current: LocalWorkspace) => {
      if (current.closed) throw new Error("Access to closed resource");
      return ["fresh"];
    });

    const { result, rerender } = await renderHook(
      ({ current }: { current: LocalWorkspace }) =>
        useLocalQuery(current, options(read, { onClosedWorkspace })),
      { initialProps: { current: closedWorkspace } },
    );

    expect(onClosedWorkspace).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(captureSpy).not.toHaveBeenCalled();

    await rerender({ current: freshWorkspace });
    expect(result.current.data).toEqual(["fresh"]);
    expect(result.current.error).toBeNull();
    captureSpy.mockRestore();
  });

  it("triggers onClosedWorkspace when retrying on a closed handle and reports non-closed failures", async () => {
    const nativeClosed = { databaseName: "workspace-a.db", closed: false } as LocalWorkspace;
    const onClosedWorkspace = jest.fn();
    const captureSpy = jest.spyOn(telemetry, "captureException").mockResolvedValue(undefined);
    const closedRead = jest.fn(async (): Promise<string[]> => {
      throw new Error(
        "Call to function 'NativeStatement.runAsync' failed: Access to closed resource",
      );
    });

    const closedHook = await renderHook(() =>
      useLocalQuery(nativeClosed, options(closedRead, { onClosedWorkspace })),
    );
    expect(nativeClosed.closed).toBe(true);
    expect(onClosedWorkspace).toHaveBeenCalledTimes(1);

    await act(async () => closedHook.result.current.retry());
    expect(onClosedWorkspace).toHaveBeenCalledTimes(2);
    expect(closedHook.result.current.error).toBe("Goals could not be read.");

    const readError = new Error("SQLITE_IOERR");
    const brokenRead = jest.fn(async (): Promise<string[]> => {
      throw readError;
    });
    const brokenWorkspace = { databaseName: "workspace-b.db", closed: false } as LocalWorkspace;
    await renderHook(() =>
      useLocalQuery(brokenWorkspace, options(brokenRead, { onClosedWorkspace })),
    );

    expect(captureSpy).toHaveBeenCalledWith(readError, "local-query");
    captureSpy.mockRestore();
  });
});
