import type { DatabaseSync } from "node:sqlite";

import type { MobileSyncChange } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository, encodeMobileSyncCursor } from "../src/db/mobile-sync";
import { createMobileSyncTestEnvironment } from "./helpers/mobile-sync-test-environment";

const databases: DatabaseSync[] = [];

function environment() {
  const created = createMobileSyncTestEnvironment();
  databases.push(created.database);
  return created;
}

function currentCursor(database: DatabaseSync, tenantId: string): string {
  const row = database
    .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
    .get(tenantId) as { sequence: number } | undefined;
  return encodeMobileSyncCursor(Number(row?.sequence ?? 0));
}

function applyChanges(replica: Map<string, unknown>, changes: MobileSyncChange[]): void {
  for (const change of changes) {
    const key = `${change.entityType}:${change.entityId}`;
    if (change.operation === "delete") replica.delete(key);
    else replica.set(key, change.payload);
  }
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("mobile sync convergence", () => {
  it("converges two clients through retry, conflict, pull, and tombstone deletion", async () => {
    const { env, database } = environment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const clientA = "a0000000-0000-4000-8000-000000000001";
    const clientB = "b0000000-0000-4000-8000-000000000001";
    const transactionId = "a0000000-0000-4000-8000-000000000002";
    const baseline = currentCursor(database, "tenant-1");
    const replicaA = new Map<string, unknown>();
    const replicaB = new Map<string, unknown>();

    const create = {
      protocolVersion: 1 as const,
      clientId: clientA,
      operations: [
        {
          operationId: "a0000000-0000-4000-8000-000000000003",
          idempotencyKey: "a0000000-0000-4000-8000-000000000004",
          entityType: "transaction" as const,
          entityId: transactionId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            kind: "expense" as const,
            date: "2026-08-22",
            description: "Offline lunch",
            amountMinor: 2_500,
            currency: "PHP" as const,
            categoryId: "category-1",
            accountId: "account-1",
          },
        },
      ],
    };

    const acknowledgedCreate = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(acknowledgedCreate);

    const firstPull = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: baseline,
      limit: 50,
    });
    applyChanges(replicaA, firstPull.changes);
    applyChanges(replicaB, firstPull.changes);

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId: clientB,
      operations: [
        {
          operationId: "b0000000-0000-4000-8000-000000000002",
          idempotencyKey: "b0000000-0000-4000-8000-000000000003",
          entityType: "transaction",
          entityId: transactionId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { description: "Lunch with team", amountMinor: 3_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId: clientA,
      operations: [
        {
          operationId: "a0000000-0000-4000-8000-000000000005",
          idempotencyKey: "a0000000-0000-4000-8000-000000000006",
          entityType: "transaction",
          entityId: transactionId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { description: "Stale local lunch" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
    });

    const updatePull = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: firstPull.nextCursor,
      limit: 50,
    });
    applyChanges(replicaA, updatePull.changes);
    applyChanges(replicaB, updatePull.changes);
    expect(replicaA).toEqual(replicaB);

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId: clientA,
      operations: [
        {
          operationId: "a0000000-0000-4000-8000-000000000007",
          idempotencyKey: "a0000000-0000-4000-8000-000000000008",
          entityType: "transaction",
          entityId: transactionId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });

    const deletePull = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: updatePull.nextCursor,
      limit: 50,
    });
    applyChanges(replicaA, deletePull.changes);
    applyChanges(replicaB, deletePull.changes);
    expect(replicaA).toEqual(replicaB);
    expect(replicaA.has(`transaction:${transactionId}`)).toBe(false);
    expect(
      database.prepare("SELECT id FROM transactions WHERE id = ?").get(transactionId),
    ).toBeUndefined();
    expect(deletePull.changes).toContainEqual(
      expect.objectContaining({
        entityType: "transaction",
        entityId: transactionId,
        operation: "delete",
        revision: 3,
      }),
    );
  });

  it("never exposes another tenant while bootstrapping a replica", async () => {
    const { env } = environment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const tenantOne = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: null,
      limit: 100,
    });
    const tenantTwo = await repository.pull(env, "tenant-2", {
      protocolVersion: 1,
      cursor: null,
      limit: 100,
    });

    expect(tenantOne.changes.some((change) => change.entityId === "transaction-2")).toBe(false);
    expect(tenantTwo.changes.some((change) => change.entityId === "transaction-1")).toBe(false);
    expect(tenantOne.changes.some((change) => change.entityId === "transaction-1")).toBe(true);
    expect(tenantTwo.changes.some((change) => change.entityId === "transaction-2")).toBe(true);
  });
});
