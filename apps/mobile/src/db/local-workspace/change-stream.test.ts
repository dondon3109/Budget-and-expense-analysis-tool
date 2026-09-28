import { addDatabaseChangeListener } from "expo-sqlite";

import { subscribeToLocalChanges } from "./change-stream";

type ChangeListener = Parameters<typeof addDatabaseChangeListener>[0];

jest.mock("expo-sqlite", () => ({ addDatabaseChangeListener: jest.fn() }));

const listeners: ChangeListener[] = [];
const removals: jest.Mock[] = [];

function emit(databaseFilePath: string, tableName: string): void {
  for (const listener of listeners) {
    listener({ databaseName: "main", databaseFilePath, tableName, rowId: 1 });
  }
}

describe("local change stream", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    listeners.length = 0;
    removals.length = 0;
    jest.mocked(addDatabaseChangeListener).mockImplementation((listener) => {
      listeners.push(listener);
      const remove = jest.fn();
      removals.push(remove);
      return { remove } as unknown as ReturnType<typeof addDatabaseChangeListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("coalesces a burst of row changes into one refresh", () => {
    const refresh = jest.fn();
    const unsubscribe = subscribeToLocalChanges("workspace-a.db", ["transactions"], refresh);

    for (let row = 0; row < 25; row += 1) emit("/data/workspace-a.db", "transactions");
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(refresh).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("ignores other tables and other databases", () => {
    const refresh = jest.fn();
    const unsubscribe = subscribeToLocalChanges("workspace-a.db", ["budgets"], refresh);

    emit("/data/workspace-a.db", "transactions");
    emit("/data/workspace-b.db", "budgets");
    jest.advanceTimersByTime(50);
    expect(refresh).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("shares one native listener per database", () => {
    const first = subscribeToLocalChanges("workspace-a.db", ["accounts"], jest.fn());
    const second = subscribeToLocalChanges("workspace-a.db", ["categories"], jest.fn());
    expect(addDatabaseChangeListener).toHaveBeenCalledTimes(1);

    const other = subscribeToLocalChanges("workspace-b.db", ["accounts"], jest.fn());
    expect(addDatabaseChangeListener).toHaveBeenCalledTimes(2);

    first();
    second();
    other();
  });

  it("cancels a pending refresh on unsubscribe and removes the listener after the last one", () => {
    const kept = jest.fn();
    const dropped = jest.fn();
    const unsubscribeKept = subscribeToLocalChanges("workspace-a.db", ["goals"], kept);
    const unsubscribeDropped = subscribeToLocalChanges("workspace-a.db", ["goals"], dropped);

    emit("/data/workspace-a.db", "goals");
    unsubscribeDropped();
    jest.advanceTimersByTime(50);
    expect(dropped).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
    expect(removals[0]).not.toHaveBeenCalled();

    unsubscribeKept();
    expect(removals[0]).toHaveBeenCalledTimes(1);

    // The next subscriber opens a fresh native listener instead of reusing the removed one.
    const again = subscribeToLocalChanges("workspace-a.db", ["goals"], jest.fn());
    expect(addDatabaseChangeListener).toHaveBeenCalledTimes(2);
    again();
  });
});
