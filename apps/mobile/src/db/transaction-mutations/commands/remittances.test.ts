import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SQLiteDatabase } from "expo-sqlite";

import { LocalDatabaseWriter } from "../../database-writer";
import { migrations } from "../../migrations";
import { readRemittanceOverview } from "../../remittance-queries";
import { LocalTransactionMutationRepository } from "../../transaction-mutation-repository";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const native = new DatabaseSync(":memory:");
const database = {
  getFirstAsync: async (source: string, ...params: unknown[]) =>
    native.prepare(source).get(...(params as SQLInputValue[])) ?? null,
  getAllAsync: async (source: string, ...params: unknown[]) =>
    native.prepare(source).all(...(params as SQLInputValue[])),
  runAsync: async (source: string, ...params: unknown[]) =>
    native.prepare(source).run(...(params as SQLInputValue[])),
  withTransactionAsync: async (task: () => Promise<void>) => {
    native.exec("BEGIN IMMEDIATE");
    try {
      await task();
      native.exec("COMMIT");
    } catch (error) {
      native.exec("ROLLBACK");
      throw error;
    }
  },
};

let uuidCounter = 0;
const mutations = new LocalTransactionMutationRepository(
  database as unknown as SQLiteDatabase,
  new LocalDatabaseWriter(),
  () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  () => new Date("2026-10-13T16:00:00.000Z"),
  () => 0.5,
);

const send = {
  sentAmountMinor: 50_000,
  sentCurrency: "USD" as const,
  provider: "Remitly",
  sentOn: "2026-10-10",
};
const arrival = {
  amountMinor: 2_800_000,
  accountId: "account-1",
  categoryId: "category-1",
  date: "2026-10-12",
};

function outbox(id: string) {
  return native
    .prepare(
      "SELECT operation_type, payload_json, state FROM sync_outbox WHERE entity_id = ? ORDER BY created_sequence",
    )
    .all(id) as { operation_type: string; payload_json: string; state: string }[];
}

function settle(id: string) {
  native.exec(
    `UPDATE remittances SET sync_state = 'synced', server_revision = 1, server_updated_at = '2026-10-11T00:00:00.000Z' WHERE id = '${id}'`,
  );
  native.exec(`DELETE FROM sync_outbox WHERE entity_id = '${id}'`);
}

beforeAll(() => {
  native.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) native.exec(migration.sql);
  native.exec(`
    INSERT INTO accounts (id, name, type, currency, archived, system, server_revision, sync_state)
      VALUES ('account-1', 'Home wallet', 'cash', 'PHP', 0, 0, 1, 'synced');
    INSERT INTO categories (
      id, name, kind, color, archived, system, origin, required_plan, locked, server_revision, sync_state
    ) VALUES ('category-1', 'Remittance', 'income', '#123456', 0, 0, 'custom', 'free', 0, 1, 'synced');
  `);
});

afterAll(() => native.close());
beforeEach(() => {
  native.exec("DELETE FROM sync_outbox; DELETE FROM remittances; DELETE FROM transactions;");
});

describe("family remittances", () => {
  it("folds a receive into a send that has not uploaded, booking one income entry", async () => {
    const id = await mutations.sendRemittance("user-me", send);
    await mutations.receiveRemittance("user-me", id, arrival);

    const operations = outbox(id);
    expect(operations).toHaveLength(1);
    const payload = JSON.parse(operations[0]!.payload_json);
    expect(payload.received).toMatchObject({ amountMinor: 2_800_000, accountId: "account-1" });
    const entry = native
      .prepare("SELECT amount_minor, kind, author_user_id FROM transactions WHERE id = ?")
      .get(payload.received.transactionId);
    expect(entry).toEqual({ amount_minor: 2_800_000, kind: "income", author_user_id: "user-me" });

    const overview = await readRemittanceOverview(
      database as unknown as SQLiteDatabase,
      "2026-10-01",
      "PHP",
    );
    expect(overview.month.sentMinor).toBe(2_800_000);
    expect(overview.leftMinor).toBe(2_800_000);
    expect(overview.pending).toEqual([]);
    expect(overview.recent[0]?.received?.amountMinor).toBe(2_800_000);
  });

  it("marks the arrival entry synced when its remittance is acknowledged", async () => {
    const id = await mutations.sendRemittance("user-me", { ...send, received: arrival });
    const request = await mutations.getPushBatch();
    const operation = request!.operations[0]!;
    await mutations.applyPushResponse(request!, {
      protocolVersion: request!.protocolVersion,
      results: [
        {
          operationId: operation.operationId,
          entityType: "remittance",
          entityId: id,
          status: "acknowledged",
          revision: 4,
        },
      ],
    });
    expect(native.prepare("SELECT sync_state FROM transactions").get()).toEqual({
      sync_state: "synced",
    });
  });

  it("drops a cancelled send that never uploaded, and queues a delete for one that did", async () => {
    const local = await mutations.sendRemittance("user-me", send);
    await mutations.cancelRemittance(local);
    expect(native.prepare("SELECT id FROM remittances WHERE id = ?").get(local)).toBeUndefined();
    expect(outbox(local)).toEqual([]);

    const uploaded = await mutations.sendRemittance("user-me", send);
    settle(uploaded);
    await mutations.cancelRemittance(uploaded);
    expect(outbox(uploaded).map((row) => row.operation_type)).toEqual(["delete"]);
  });

  it("puts a refused receive back on the way and removes its local entry", async () => {
    const id = await mutations.sendRemittance("user-other", send);
    settle(id);
    await mutations.receiveRemittance("user-me", id, arrival);
    native.exec(`UPDATE sync_outbox SET state = 'failed' WHERE entity_id = '${id}'`);

    await mutations.discardRemittanceChange(id);

    expect(native.prepare("SELECT transaction_id, sync_state FROM remittances").get()).toEqual({
      transaction_id: null,
      sync_state: "synced",
    });
    expect(native.prepare("SELECT COUNT(*) AS n FROM transactions").get()).toEqual({ n: 0 });
    expect(outbox(id)).toEqual([]);
  });
});
