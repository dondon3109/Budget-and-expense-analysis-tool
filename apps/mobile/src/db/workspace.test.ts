/// <reference types="node" />

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { openDatabaseAsync } from "expo-sqlite";

import { snapshotMobileSync } from "@/api/mobile-sync";

import {
  closeLocalWorkspace,
  describeWorkspaceOpenFailure,
  discardAllWorkspaces,
  discardLocalWorkspace,
  fetchAndApplySnapshot,
  inspectLocalWorkspaceForSignOut,
  isWorkspaceSyncDirty,
  markWorkspaceSyncDirty,
  openLocalWorkspace,
  recoverLocalWorkspace,
  resolveWorkspaceHasSynced,
  withDetachedWorkspace,
} from "./workspace";

const mockNativeDatabases = new Map<string, DatabaseSync>();
const mockKeyStoreKeys = new Map<string, string>();
const mockKeyStoreGenerations = new Map<string, number>();

function mockCreateSqliteHandle(name: string, native: DatabaseSync) {
  let closed = false;
  return {
    getFirstAsync: async <T>(source: string, ...params: unknown[]): Promise<T | null> => {
      if (closed) throw new Error("database is closed");
      if (source.trim().toUpperCase() === "PRAGMA CIPHER_VERSION") {
        return { cipher_version: "4.6.1" } as T;
      }
      return (native.prepare(source).get(...(params as SQLInputValue[])) as T | undefined) ?? null;
    },
    getAllAsync: async <T>(source: string, ...params: unknown[]): Promise<T[]> => {
      if (closed) throw new Error("database is closed");
      return native.prepare(source).all(...(params as SQLInputValue[])) as T[];
    },
    runAsync: async (source: string, ...params: unknown[]) => {
      if (closed) throw new Error("database is closed");
      return native.prepare(source).run(...(params as SQLInputValue[]));
    },
    execAsync: async (source: string) => {
      if (closed) throw new Error("database is closed");
      if (/^\s*PRAGMA\s+key\s*=/i.test(source)) return;
      if (/^\s*PRAGMA\s+wal_checkpoint/i.test(source)) return;
      native.exec(source);
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      if (closed) throw new Error("database is closed");
      native.exec("BEGIN IMMEDIATE");
      try {
        await task();
        native.exec("COMMIT");
      } catch (error) {
        native.exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: jest.fn(async () => {
      closed = true;
    }),
    __name: name,
  };
}

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => globalThis.crypto.randomUUID()),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(async (name: string) => {
    let native = mockNativeDatabases.get(name);
    if (!native) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync: NodeDatabaseSync } = require("node:sqlite") as {
        DatabaseSync: typeof DatabaseSync;
      };
      native = new NodeDatabaseSync(":memory:");
      mockNativeDatabases.set(name, native);
    }
    return mockCreateSqliteHandle(name, native);
  }),
  deleteDatabaseAsync: jest.fn(async (name: string) => {
    const native = mockNativeDatabases.get(name);
    if (native) {
      native.close();
      mockNativeDatabases.delete(name);
    }
  }),
}));

jest.mock("./local-data-security", () => ({
  ensureLocalDataBackupProtection: jest.fn(async () => undefined),
}));

jest.mock("./key-store", () => ({
  workspaceAlias: jest.fn(async (subject: string) => subject.replace(/[^a-z0-9]/gi, "_")),
  getOrCreateWorkspaceKey: jest.fn(async (alias: string) => {
    let key = mockKeyStoreKeys.get(alias);
    if (!key) {
      key = "a".repeat(64);
      mockKeyStoreKeys.set(alias, key);
    }
    return key;
  }),
  removeWorkspaceKey: jest.fn(async (alias: string) => {
    mockKeyStoreKeys.delete(alias);
  }),
  getWorkspaceGeneration: jest.fn(async (alias: string) => mockKeyStoreGenerations.get(alias) ?? 1),
  setWorkspaceGeneration: jest.fn(async (alias: string, generation: number) => {
    mockKeyStoreGenerations.set(alias, generation);
  }),
  removeWorkspaceGeneration: jest.fn(async (alias: string) => {
    mockKeyStoreGenerations.delete(alias);
  }),
}));

jest.mock("@/api/mobile-sync", () => ({
  snapshotMobileSync: jest.fn(),
}));

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

describe("workspace per-subject locking, streaming snapshot, sign-out risk, and dirty cache", () => {
  beforeEach(async () => {
    await closeLocalWorkspace();
    for (const db of mockNativeDatabases.values()) db.close();
    mockNativeDatabases.clear();
    mockKeyStoreKeys.clear();
    mockKeyStoreGenerations.clear();
    jest.mocked(openDatabaseAsync).mockClear();
    jest.mocked(snapshotMobileSync).mockReset();
  });

  afterEach(async () => {
    await closeLocalWorkspace();
  });

  it("serializes operations per subject without blocking unrelated subjects", async () => {
    const events: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const firstA = withDetachedWorkspace("subject-a", async () => {
      events.push("a1:start");
      await gateA;
      events.push("a1:end");
    });
    const secondA = withDetachedWorkspace("subject-a", async () => {
      events.push("a2");
    });
    const firstB = withDetachedWorkspace("subject-b", async () => {
      events.push("b1");
    });

    await firstB;
    expect(events).toContain("b1");
    expect(events).not.toContain("a2");

    releaseA();
    await Promise.all([firstA, secondA]);
    expect(events.indexOf("a1:end")).toBeLessThan(events.indexOf("a2"));
  });

  it("tracks tri-state sync dirty cache across opens, mutations, receipt uploads, and discards", async () => {
    expect(isWorkspaceSyncDirty("subject-clean")).toBeUndefined();

    const workspace = await openLocalWorkspace("subject-clean");
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(false);

    await workspace.transactionMutations.createAccount({ name: "Wallet", type: "cash" });
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(true);

    const batch = (await workspace.transactionMutations.getPushBatch())!;
    await workspace.transactionMutations.applyPushResponse(batch, {
      protocolVersion: 1,
      results: [
        {
          operationId: batch.operations[0]!.operationId,
          entityType: "account",
          entityId: batch.operations[0]!.entityId,
          status: "acknowledged",
          revision: 1,
        },
      ],
    });
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(false);

    await workspace.transactionMutations.queueReceiptUpload(["tx-1"], {
      mimeType: "image/jpeg",
      base64: "abcd",
    });
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(true);

    const ready = await workspace.transactionMutations.readyReceiptUploads();
    expect(ready).toHaveLength(0);
    await workspace.transactionMutations.queueReceiptUpload(["tx-2"], {
      mimeType: "image/jpeg",
      base64: "abcd",
    });
    const row = await workspace.database.getFirstAsync<{ id: string }>(
      "SELECT id FROM receipt_uploads LIMIT 1",
    );
    await workspace.transactionMutations.finishReceiptUpload(row!.id);
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(false);

    markWorkspaceSyncDirty("subject-clean", true);
    expect(isWorkspaceSyncDirty("subject-clean")).toBe(true);
    await discardAllWorkspaces(["subject-clean"]);
    expect(isWorkspaceSyncDirty("subject-clean")).toBeUndefined();
  });

  it("inspects only outbox and conflict counts for sign-out risk across workspaces", async () => {
    const wsA = await openLocalWorkspace("subject-a");
    await wsA.transactionMutations.createAccount({ name: "Cash", type: "cash" });
    await closeLocalWorkspace("subject-a");

    await withDetachedWorkspace("subject-b", async (wsB) => {
      await wsB.database.runAsync(`
        INSERT INTO sync_conflicts (
          conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
          server_json, server_revision, created_at
        ) VALUES (
          '00000000-0000-4000-8000-000000000011', 'account', 'acc-1', NULL,
          '{}', '{}', '{}', 1, '2026-08-13T00:00:00.000Z'
        )
      `);
    });

    await expect(inspectLocalWorkspaceForSignOut(["subject-a", "subject-b"])).resolves.toEqual({
      unsyncedOperationCount: 1,
      unresolvedConflictCount: 1,
    });

    await discardLocalWorkspace("subject-a");
    await discardLocalWorkspace("subject-b");
  });

  it("streams snapshot pages into a new generation on recovery and cleans up failed staging DBs", async () => {
    const initial = await openLocalWorkspace("subject-snap");
    expect(initial.generation).toBe(1);

    jest
      .mocked(snapshotMobileSync)
      .mockResolvedValueOnce({
        protocolVersion: 1,
        snapshotCursor: "s1.1",
        changes: [
          {
            entityType: "account",
            entityId: "acc-1",
            revision: 1,
            operation: "upsert",
            serverUpdatedAt: "2026-08-14 12:00:00",
            payload: {
              id: "acc-1",
              name: "Wallet",
              type: "cash",
              currency: "PHP",
              archived: false,
              system: false,
              interest: {
                enabled: false,
                annualRateBasisPoints: null,
                frequency: null,
                payDay: null,
              },
              revision: 1,
              updatedAt: "2026-08-14 12:00:00",
            },
          },
        ],
        nextOffset: 1,
        hasMore: true,
        resumeCursor: "v1.5",
      })
      .mockResolvedValueOnce({
        protocolVersion: 1,
        snapshotCursor: "s1.1",
        changes: [
          {
            entityType: "category",
            entityId: "cat-1",
            revision: 1,
            operation: "upsert",
            serverUpdatedAt: "2026-08-14 12:00:00",
            payload: {
              id: "cat-1",
              name: "Food",
              kind: "expense",
              color: "#123456",
              iconEmoji: "🍔",
              archived: false,
              system: false,
              origin: "starter",
              requiredPlan: "free",
              locked: false,
              revision: 1,
              updatedAt: "2026-08-14 12:00:00",
            },
          },
        ],
        nextOffset: 2,
        hasMore: false,
        resumeCursor: "v1.5",
      });

    await recoverLocalWorkspace("subject-snap", "token-1");
    expect(isWorkspaceSyncDirty("subject-snap")).toBe(false);
    expect(mockKeyStoreGenerations.get("subject_snap")).toBe(2);
    expect(mockNativeDatabases.has("zoption-subject_snap.db")).toBe(false);

    const reopened = await openLocalWorkspace("subject-snap");
    expect(reopened.generation).toBe(2);
    expect(reopened.hasSynced).toBe(true);
    await expect(reopened.syncRepository.getCursor()).resolves.toBe("v1.5");

    // A failing recovery discards the staging generation (g3) and leaves g2 intact.
    jest.mocked(snapshotMobileSync).mockRejectedValueOnce(new Error("network down"));
    await expect(recoverLocalWorkspace("subject-snap", "token-1")).rejects.toThrow("network down");
    expect(mockKeyStoreGenerations.get("subject_snap")).toBe(2);
    expect(mockNativeDatabases.has("zoption-subject_snap-g3.db")).toBe(false);
    expect(mockNativeDatabases.has("zoption-subject_snap-g2.db")).toBe(true);

    // Direct fetchAndApplySnapshot streams cleanly onto an open workspace.
    const fresh = await openLocalWorkspace("subject-initial");
    const streamed = await fetchAndApplySnapshot({
      syncRepository: fresh.syncRepository,
      fetchPage: async () => ({
        snapshotCursor: "s1.2",
        changes: [],
        nextOffset: 0,
        hasMore: false,
        resumeCursor: "v1.9",
      }),
    });
    expect(streamed).toEqual({ resumeCursor: "v1.9", pageCount: 1, changeCount: 0 });
    await expect(fresh.syncRepository.getCursor()).resolves.toBe("v1.9");
  });
});

describe("workspace handle leases", () => {
  beforeEach(async () => {
    await closeLocalWorkspace();
    for (const db of mockNativeDatabases.values()) db.close();
    mockNativeDatabases.clear();
    mockKeyStoreKeys.clear();
    mockKeyStoreGenerations.clear();
    jest.mocked(openDatabaseAsync).mockClear();
  });

  afterEach(async () => {
    await closeLocalWorkspace();
  });

  it("keeps a shared workspace open until every overlapping lease closes", async () => {
    const leaseA = Symbol("mount-a");
    const leaseB = Symbol("mount-b");
    const first = await openLocalWorkspace("user-1", leaseA);
    const second = await openLocalWorkspace("user-1", leaseB);

    expect(second).toBe(first);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);

    await closeLocalWorkspace("user-1", leaseA);
    expect(first.database.closeAsync).not.toHaveBeenCalled();
    expect(first.closed).toBe(false);

    await closeLocalWorkspace("user-1", leaseB);
    expect(first.database.closeAsync).toHaveBeenCalledTimes(1);
    expect(first.closed).toBe(true);
  });

  it("ignores a stale lease after the workspace has already been reopened", async () => {
    const staleLease = Symbol("stale");
    const liveLease = Symbol("live");
    await openLocalWorkspace("user-1", staleLease);
    await closeLocalWorkspace("user-1");

    const reopened = await openLocalWorkspace("user-1", liveLease);
    await closeLocalWorkspace("user-1", staleLease);

    expect(reopened.database.closeAsync).not.toHaveBeenCalled();
    expect(reopened.closed).toBe(false);
  });

  it("opens a fresh handle instead of reusing one marked closed", async () => {
    const first = await openLocalWorkspace("user-1", Symbol("first"));
    first.closed = true;

    const second = await openLocalWorkspace("user-1", Symbol("second"));
    expect(second).not.toBe(first);
    expect(second.closed).toBe(false);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });
});
