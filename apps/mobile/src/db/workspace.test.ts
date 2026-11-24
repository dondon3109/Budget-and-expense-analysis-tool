import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import {
  closeLocalWorkspace,
  describeWorkspaceOpenFailure,
  openLocalWorkspace,
  resolveWorkspaceHasSynced,
} from "./workspace";

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(async () => undefined),
}));

jest.mock("./key-store", () => ({
  workspaceAlias: jest.fn(async (subject: string) => `alias-${subject}`),
  getWorkspaceGeneration: jest.fn(async () => 1),
  getOrCreateWorkspaceKey: jest.fn(async () => "a".repeat(64)),
  setWorkspaceGeneration: jest.fn(async () => undefined),
  removeWorkspaceKey: jest.fn(async () => undefined),
  removeWorkspaceGeneration: jest.fn(async () => undefined),
}));

jest.mock("./local-data-security", () => ({
  ensureLocalDataBackupProtection: jest.fn(async () => undefined),
}));

jest.mock("./migrations", () => ({
  applyLocalMigrations: jest.fn(async () => 20),
  asMigrationDatabase: (database: SQLiteDatabase) => database,
}));

function makeFakeDatabase(subject: string) {
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes("PRAGMA cipher_version")) return { cipher_version: "4.6.1" };
      if (sql.includes("sqlite_master")) return { count: 1 };
      if (sql.includes("workspace_metadata")) return { value: subject };
      if (sql.includes("sync_metadata")) {
        return { server_cursor: null, server_acknowledged_cursor: null, outbox_count: 0 };
      }
      return null;
    }),
    closeAsync: jest.fn(async () => undefined),
  };
}

describe("workspace open failure classification", () => {
  it("gives recovery guidance for corrupted database files", () => {
    expect(
      describeWorkspaceOpenFailure(new Error("SQLITE_CORRUPT: database disk image is malformed")),
    ).toMatch(/damaged/);
    expect(describeWorkspaceOpenFailure(new Error("file is not a database"))).toMatch(/damaged/);
    expect(describeWorkspaceOpenFailure(new Error("SQLITE_NOTADB"))).toMatch(/damaged/);
  });

  it("never surfaces raw native error text", () => {
    const message = describeWorkspaceOpenFailure(
      new Error("secret key material /path/to/sensitive/file.db"),
    );
    expect(message).toBe("The encrypted local workspace could not be opened on this device.");
  });

  it("handles non-Error failures", () => {
    expect(describeWorkspaceOpenFailure("boom")).toBe(
      "The encrypted local workspace could not be opened on this device.",
    );
    expect(describeWorkspaceOpenFailure(undefined)).toBe(
      "The encrypted local workspace could not be opened on this device.",
    );
  });
});

describe("resolveWorkspaceHasSynced", () => {
  const fresh = {
    localOnly: false,
    generation: 1,
    serverCursor: null,
    serverAcknowledgedCursor: null,
    outboxCount: 0,
  };

  it("returns false for a fresh file and for one killed mid-initial-pull", () => {
    expect(resolveWorkspaceHasSynced(fresh)).toBe(false);
    expect(resolveWorkspaceHasSynced({ ...fresh, serverCursor: "v1.5k" })).toBe(false);
  });

  it("returns true once acknowledged, rebuilt from a snapshot, local-only, or holding outbox rows", () => {
    expect(resolveWorkspaceHasSynced({ ...fresh, serverAcknowledgedCursor: "v1.5k" })).toBe(true);
    expect(resolveWorkspaceHasSynced({ ...fresh, generation: 2, serverCursor: "v1.5k" })).toBe(
      true,
    );
    expect(resolveWorkspaceHasSynced({ ...fresh, localOnly: true })).toBe(true);
    expect(resolveWorkspaceHasSynced({ ...fresh, outboxCount: 1 })).toBe(true);
  });
});

describe("workspace handle leases", () => {
  beforeEach(() => {
    jest.mocked(openDatabaseAsync).mockReset();
  });

  afterEach(async () => {
    await closeLocalWorkspace();
  });

  it("keeps a shared workspace open until every overlapping lease closes", async () => {
    const db = makeFakeDatabase("user-1");
    jest.mocked(openDatabaseAsync).mockResolvedValueOnce(db as unknown as SQLiteDatabase);

    const leaseA = Symbol("mount-a");
    const leaseB = Symbol("mount-b");
    const first = await openLocalWorkspace("user-1", leaseA);
    const second = await openLocalWorkspace("user-1", leaseB);

    expect(second).toBe(first);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);

    await closeLocalWorkspace("user-1", leaseA);
    expect(db.closeAsync).not.toHaveBeenCalled();
    expect(first.closed).toBe(false);

    await closeLocalWorkspace("user-1", leaseB);
    expect(db.closeAsync).toHaveBeenCalledTimes(1);
    expect(first.closed).toBe(true);
  });

  it("ignores a stale lease after the workspace has already been reopened", async () => {
    const db1 = makeFakeDatabase("user-1");
    const db2 = makeFakeDatabase("user-1");
    jest
      .mocked(openDatabaseAsync)
      .mockResolvedValueOnce(db1 as unknown as SQLiteDatabase)
      .mockResolvedValueOnce(db2 as unknown as SQLiteDatabase);

    const staleLease = Symbol("stale");
    const liveLease = Symbol("live");
    await openLocalWorkspace("user-1", staleLease);
    await closeLocalWorkspace("user-1");

    const reopened = await openLocalWorkspace("user-1", liveLease);
    await closeLocalWorkspace("user-1", staleLease);

    expect(db2.closeAsync).not.toHaveBeenCalled();
    expect(reopened.closed).toBe(false);
  });

  it("opens a fresh handle instead of reusing one marked closed", async () => {
    const db1 = makeFakeDatabase("user-1");
    const db2 = makeFakeDatabase("user-1");
    jest
      .mocked(openDatabaseAsync)
      .mockResolvedValueOnce(db1 as unknown as SQLiteDatabase)
      .mockResolvedValueOnce(db2 as unknown as SQLiteDatabase);

    const first = await openLocalWorkspace("user-1", Symbol("first"));
    first.closed = true;

    const second = await openLocalWorkspace("user-1", Symbol("second"));
    expect(second).not.toBe(first);
    expect(second.closed).toBe(false);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });
});
