import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository, encodeMobileSyncCursor } from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

describe("mobile sync transaction push repository", () => {
  const clientId = "00000000-0000-4000-8000-000000000001";
  const entityId = "00000000-0000-4000-8000-000000000002";

  function createOperation() {
    return {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000003",
          idempotencyKey: "00000000-0000-4000-8000-000000000004",
          entityType: "transaction" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            kind: "expense" as const,
            date: "2026-08-13",
            description: "Offline lunch",
            amountMinor: 12_345,
            currency: "PHP" as const,
            categoryId: "category-1",
            accountId: "account-1",
          },
        },
      ],
    };
  }

  it("creates a client-ID transaction and replays the same acknowledgement idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const input = createOperation();

    const first = await repository.push(env, "tenant-1", input);
    const replay = await repository.push(env, "tenant-1", input);

    expect(first).toEqual(replay);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1, entityId });
    expect(
      database
        .prepare("SELECT amount_minor, revision FROM transactions WHERE id = ?")
        .get(entityId),
    ).toEqual({ amount_minor: -12_345, revision: 1 });
    expect(
      database.prepare("SELECT count(*) AS count FROM transactions WHERE id = ?").get(entityId),
    ).toEqual({ count: 1 });
  });

  it("rejects reuse of one idempotency key with a different payload", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const input = createOperation();
    await repository.push(env, "tenant-1", input);
    input.operations[0]!.payload.description = "Changed request";

    await expect(repository.push(env, "tenant-1", input)).rejects.toMatchObject({
      status: 409,
      code: "idempotency_key_reused",
    });
  });

  it("updates only the expected revision and returns the server snapshot for a stale edit", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    await repository.push(env, "tenant-1", createOperation());
    const update = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000005",
          idempotencyKey: "00000000-0000-4000-8000-000000000006",
          entityType: "transaction" as const,
          entityId,
          operationType: "update" as const,
          baseRevision: 1,
          dependencyIds: [],
          payload: { description: "Updated offline lunch" },
        },
      ],
    };
    const updated = await repository.push(env, "tenant-1", update);
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT description, revision FROM transactions WHERE id = ?").get(entityId),
    ).toEqual({
      description: "Updated offline lunch",
      revision: 2,
    });

    const stale = structuredClone(update);
    stale.operations[0]!.operationId = "00000000-0000-4000-8000-000000000007";
    stale.operations[0]!.idempotencyKey = "00000000-0000-4000-8000-000000000008";
    stale.operations[0]!.payload.description = "Stale overwrite";
    const conflicted = await repository.push(env, "tenant-1", stale);
    expect(conflicted.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { description: "Updated offline lunch" },
    });
  });

  it("deletes once and emits a revisioned tombstone", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    await repository.push(env, "tenant-1", createOperation());
    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000009",
          idempotencyKey: "00000000-0000-4000-8000-000000000010",
          entityType: "transaction",
          entityId,
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT id FROM transactions WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT operation, row_revision FROM mobile_sync_changes WHERE tenant_id = ? AND entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get("tenant-1", entityId),
    ).toEqual({ operation: "delete", row_revision: 2 });
  });
});

describe("mobile sync atomic transfer repository", () => {
  const clientId = "30000000-0000-4000-8000-000000000001";
  const groupId = "30000000-0000-4000-8000-000000000002";
  const fromId = "30000000-0000-4000-8000-000000000003";
  const toId = "30000000-0000-4000-8000-000000000004";

  function seedTransferReferences(database: DatabaseSync): void {
    database
      .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
      .run("account-savings", "tenant-1", "Savings", "savings");
    database
      .prepare("INSERT INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, ?, ?, ?)")
      .run("category-transfer", "tenant-1", "Transfer", "transfer", "#008877");
  }

  function createTransfer() {
    return {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000005",
          idempotencyKey: "30000000-0000-4000-8000-000000000006",
          entityType: "transfer" as const,
          entityId: groupId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            fromTransactionId: fromId,
            toTransactionId: toId,
            transfer: {
              kind: "transfer" as const,
              date: "2026-08-14",
              description: "Emergency fund",
              amountMinor: 50_000,
              transferFeeMinor: 500,
              currency: "PHP" as const,
              categoryId: "category-transfer",
              fromAccountId: "account-1",
              toAccountId: "account-savings",
            },
          },
        },
      ],
    };
  }

  it("creates, pages, updates, conflicts, and deletes both legs atomically", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    seedTransferReferences(database);
    const beforeCreate = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );
    const create = createTransfer();

    const created = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(created);
    expect(created.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          `SELECT id, account_id, amount_minor, transfer_fee_minor, revision
           FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor`,
        )
        .all(groupId),
    ).toEqual([
      {
        id: fromId,
        account_id: "account-1",
        amount_minor: -50_000,
        transfer_fee_minor: 500,
        revision: 1,
      },
      {
        id: toId,
        account_id: "account-savings",
        amount_minor: 49_500,
        transfer_fee_minor: null,
        revision: 1,
      },
    ]);

    const createPull = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: encodeMobileSyncCursor(beforeCreate),
      limit: 1,
    });
    expect(createPull.changes).toHaveLength(2);
    expect(createPull.changes.map((change) => change.entityId)).toEqual([fromId, toId]);
    await expect(
      repository.pull(env, "tenant-1", {
        protocolVersion: 1,
        cursor: encodeMobileSyncCursor(beforeCreate + 1),
        limit: 10,
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });

    const update = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000007",
          idempotencyKey: "30000000-0000-4000-8000-000000000008",
          entityType: "transfer" as const,
          entityId: groupId,
          operationType: "update" as const,
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            transfer: {
              ...create.operations[0]!.payload.transfer,
              description: "Emergency reserve",
              amountMinor: 60_000,
              transferFeeMinor: 0,
            },
          },
        },
      ],
    };
    expect((await repository.push(env, "tenant-1", update)).results[0]).toMatchObject({
      status: "acknowledged",
      revision: 2,
    });
    expect(
      database
        .prepare(
          "SELECT description, amount_minor, revision FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor",
        )
        .all(groupId),
    ).toEqual([
      { description: "Emergency reserve", amount_minor: -60_000, revision: 2 },
      { description: "Emergency reserve", amount_minor: 60_000, revision: 2 },
    ]);

    const stale = structuredClone(update);
    stale.operations[0]!.operationId = "30000000-0000-4000-8000-000000000009";
    stale.operations[0]!.idempotencyKey = "30000000-0000-4000-8000-000000000010";
    const conflict = await repository.push(env, "tenant-1", stale);
    expect(conflict.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: {
        id: groupId,
        fromTransactionId: fromId,
        toTransactionId: toId,
        amountMinor: 60_000,
      },
    });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000011",
          idempotencyKey: "30000000-0000-4000-8000-000000000012",
          entityType: "transfer",
          entityId: groupId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE transfer_group_id = ?")
        .get(groupId),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT count(*) AS count FROM transfer_groups WHERE id = ?").get(groupId),
    ).toEqual({ count: 0 });
  });

  it("rolls back a partial create when either client leg ID collides", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    seedTransferReferences(database);
    const create = createTransfer();
    create.operations[0]!.payload.toTransactionId = "transaction-1";

    const result = await repository.push(env, "tenant-1", create);
    expect(result.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT id FROM transactions WHERE id = ?").get(fromId),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT id FROM transfer_groups WHERE id = ?").get(groupId),
    ).toBeUndefined();
  });
});
