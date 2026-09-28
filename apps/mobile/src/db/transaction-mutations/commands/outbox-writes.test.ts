/// <reference types="node" />

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SQLiteDatabase } from "expo-sqlite";

import { migrations } from "../../migrations";
import type { LocalCommandContext } from "../context";
import { outboxRowSchema } from "../model";
import { LocalMutationStore } from "../store";
import { queueCreate, queueDelete, queueUpdate } from "./outbox-writes";

const retryingOperationId = "00000000-0000-4000-8000-0000000000aa";

// The helpers must run inside the caller's transaction, so this database refuses to open one.
class HelperDatabase {
  readonly native = new DatabaseSync(":memory:");
  readonly withTransactionAsync = jest.fn(() => {
    throw new Error("outbox helpers must not open a transaction");
  });

  constructor() {
    for (const migration of migrations) this.native.exec(migration.sql);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (
      (this.native.prepare(source).get(...(params as SQLInputValue[])) as T | undefined) ?? null
    );
  }

  async runAsync(source: string, ...params: unknown[]): Promise<unknown> {
    return this.native.prepare(source).run(...(params as SQLInputValue[]));
  }

  outbox() {
    return this.native
      .prepare(
        `SELECT operation_id, operation_type, base_revision, payload_json, base_json, state,
          attempt_count, next_attempt_at, last_error_code, created_sequence
         FROM sync_outbox ORDER BY created_sequence`,
      )
      .all();
  }
}

function context(database: HelperDatabase): LocalCommandContext {
  let index = 0;
  const sqlite = database as unknown as SQLiteDatabase;
  return {
    database: sqlite,
    store: new LocalMutationStore(sqlite),
    randomUuid: () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`,
  } as unknown as LocalCommandContext;
}

/** Seeds an unsynced create that has failed once and is waiting on a retry. */
function seedRetryingCreate(database: HelperDatabase) {
  database.native.exec(`
    INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type, base_revision,
      payload_json, dependency_ids_json, base_json, state, attempt_count, next_attempt_at,
      last_error_code, created_sequence
    ) VALUES (
      '${retryingOperationId}', '00000000-0000-4000-8000-0000000000bb', 'account', 'account-1',
      'create', 0, '{"name":"Wallet"}', '[]', '{}', 'retryable', 2, '2026-08-13T16:00:00.000Z',
      'network_error', 1
    );
  `);
  return outboxRowSchema.parse(
    database.native
      .prepare(
        `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count,
          last_error_code
         FROM sync_outbox WHERE operation_id = ?`,
      )
      .get(retryingOperationId),
  );
}

describe("outbox write helpers", () => {
  let database: HelperDatabase;

  beforeEach(() => {
    database = new HelperDatabase();
  });

  afterEach(() => {
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
    database.native.close();
  });

  it("queues a create at the next sequence", async () => {
    await queueCreate(context(database), "account", "account-1", { name: "Wallet" });

    expect(database.outbox()).toEqual([
      expect.objectContaining({
        operation_type: "create",
        base_revision: 0,
        payload_json: '{"name":"Wallet"}',
        base_json: "{}",
        state: "pending",
        created_sequence: 1,
      }),
    ]);
  });

  it("rewrites an existing entry in place, keeping its operation type and resetting retry state", async () => {
    const outbox = seedRetryingCreate(database);
    const base = jest.fn(() => ({ name: "Server wallet" }));

    await queueUpdate(context(database), outbox, {
      entityType: "account",
      entityId: "account-1",
      baseRevision: 4,
      payload: { name: "Pocket" },
      base,
    });

    expect(base).not.toHaveBeenCalled();
    expect(database.outbox()).toEqual([
      {
        operation_id: retryingOperationId,
        operation_type: "create",
        base_revision: 0,
        payload_json: '{"name":"Pocket"}',
        base_json: "{}",
        state: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_error_code: null,
        created_sequence: 1,
      },
    ]);
  });

  it("reads the base snapshot only when it inserts a new update", async () => {
    const base = jest.fn(() => ({ name: "Server wallet" }));

    await queueUpdate(context(database), null, {
      entityType: "account",
      entityId: "account-1",
      baseRevision: 4,
      payload: { name: "Pocket" },
      base,
    });

    expect(base).toHaveBeenCalledTimes(1);
    expect(database.outbox()).toEqual([
      expect.objectContaining({
        operation_type: "update",
        base_revision: 4,
        payload_json: '{"name":"Pocket"}',
        base_json: '{"name":"Server wallet"}',
        state: "pending",
      }),
    ]);
  });

  it("turns an existing entry into a delete and resets retry state without reading the base", async () => {
    const outbox = seedRetryingCreate(database);
    const base = jest.fn(() => ({ name: "Server wallet" }));

    await queueDelete(context(database), outbox, {
      entityType: "account",
      entityId: "account-1",
      baseRevision: 4,
      base,
    });

    expect(base).not.toHaveBeenCalled();
    expect(database.outbox()).toEqual([
      expect.objectContaining({
        operation_id: retryingOperationId,
        operation_type: "delete",
        payload_json: "{}",
        state: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_error_code: null,
      }),
    ]);
  });

  it("queues a new delete against the synced row with its base snapshot", async () => {
    const base = jest.fn(() => ({ name: "Server wallet" }));

    await queueDelete(context(database), null, {
      entityType: "account",
      entityId: "account-1",
      baseRevision: 4,
      base,
    });

    expect(base).toHaveBeenCalledTimes(1);
    expect(database.outbox()).toEqual([
      expect.objectContaining({
        operation_type: "delete",
        base_revision: 4,
        payload_json: "{}",
        base_json: '{"name":"Server wallet"}',
      }),
    ]);
  });
});
