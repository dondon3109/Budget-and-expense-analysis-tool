import type { MobileSyncChange } from "@zoption/shared";

import {
  collectSnapshotPages,
  databaseNameForGeneration,
  SnapshotRecoveryError,
  verifySnapshotGeneration,
} from "./workspace-generation";

const accountChange: MobileSyncChange = {
  entityType: "account",
  entityId: "account-1",
  revision: 1,
  operation: "upsert",
  serverUpdatedAt: "2026-08-14 12:00:00",
  payload: {
    id: "account-1",
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
};

describe("workspace generation recovery helpers", () => {
  it("names generation 1 as the legacy database and later generations distinctly", () => {
    expect(databaseNameForGeneration("abc123", 1)).toBe("zoption-abc123.db");
    expect(databaseNameForGeneration("abc123", 2)).toBe("zoption-abc123-g2.db");
    expect(databaseNameForGeneration("abc123", 9)).toBe("zoption-abc123-g9.db");
  });

  it("collects snapshot pages until hasMore is false", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({
        snapshotCursor: "s1.9",
        changes: [accountChange],
        nextOffset: 1,
        hasMore: true,
        resumeCursor: "v1.9",
      })
      .mockResolvedValueOnce({
        snapshotCursor: "s1.9",
        changes: [accountChange],
        nextOffset: 2,
        hasMore: false,
        resumeCursor: "v1.9",
      });

    const collected = await collectSnapshotPages(fetchPage);
    expect(collected.resumeCursor).toBe("v1.9");
    expect(collected.changes).toHaveLength(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, null, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "s1.9", 1);
  });

  it("rejects a snapshot cursor that changes between pages", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({
        snapshotCursor: "s1.9",
        changes: [accountChange],
        nextOffset: 1,
        hasMore: true,
        resumeCursor: "v1.9",
      })
      .mockResolvedValueOnce({
        snapshotCursor: "s1.8",
        changes: [],
        nextOffset: 1,
        hasMore: false,
        resumeCursor: "v1.9",
      });

    await expect(collectSnapshotPages(fetchPage)).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects a snapshot offset that skips rows", async () => {
    const fetchPage = jest.fn(() =>
      Promise.resolve({
        snapshotCursor: "s1.9",
        changes: [accountChange],
        nextOffset: 3,
        hasMore: false,
        resumeCursor: "v1.9",
      }),
    );

    await expect(collectSnapshotPages(fetchPage)).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects a snapshot that exceeds the safe page limit", async () => {
    const fetchPage = jest.fn(() =>
      Promise.resolve({
        snapshotCursor: "s1.9",
        changes: [accountChange],
        nextOffset: 1,
        hasMore: true,
        resumeCursor: "v1.9",
      }),
    );

    await expect(collectSnapshotPages(fetchPage, 2)).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });
});

describe("snapshot generation verification", () => {
  function mockDatabase(overrides: {
    foreignKeys?: unknown[];
    brokenTransfers?: unknown[];
    subject?: string | null;
    client?: string | null;
    cursor?: string | null;
    outbox?: number;
    conflicts?: number;
  } = {}) {
    return {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce(overrides.foreignKeys ?? [])
        .mockResolvedValueOnce(overrides.brokenTransfers ?? []),
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce(
          overrides.subject === undefined ? { value: "subject-1" } : { value: overrides.subject },
        )
        .mockResolvedValueOnce(
          overrides.client === undefined ? { value: "client-1" } : { value: overrides.client },
        )
        .mockResolvedValueOnce(
          overrides.cursor === undefined
            ? { server_cursor: "v1.9" }
            : { server_cursor: overrides.cursor },
        )
        .mockResolvedValueOnce({ count: overrides.outbox ?? 0 })
        .mockResolvedValueOnce({ count: overrides.conflicts ?? 0 })
        .mockResolvedValueOnce({ account_count: 1, category_count: 1, transaction_count: 1 }),
    };
  }

  it("verifies a valid recovered generation", async () => {
    await expect(
      verifySnapshotGeneration(mockDatabase() as never, "subject-1", "client-1", "v1.9"),
    ).resolves.toEqual({ accountCount: 1, categoryCount: 1, transactionCount: 1 });
  });

  it("rejects foreign key violations", async () => {
    const database = mockDatabase({ foreignKeys: [{ id: 1 }] });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects incomplete transfers", async () => {
    const database = mockDatabase({ brokenTransfers: [{ transfer_group_id: "group-1" }] });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects a different identity", async () => {
    const database = mockDatabase({ subject: "subject-2" });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects a lost installation identity", async () => {
    const database = mockDatabase({ client: "client-2" });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects a cursor that does not match the snapshot", async () => {
    const database = mockDatabase({ cursor: "v1.8" });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });

  it("rejects retained unsynchronized work", async () => {
    const database = mockDatabase({ outbox: 1 });
    await expect(
      verifySnapshotGeneration(database as never, "subject-1", "client-1", "v1.9"),
    ).rejects.toBeInstanceOf(SnapshotRecoveryError);
  });
});
