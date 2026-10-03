import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SQLiteDatabase } from "expo-sqlite";

import { LocalDatabaseWriter } from "./database-writer";
import { migrations } from "./migrations";
import { LocalTransactionMutationRepository } from "./transaction-mutation-repository";

function createRepository() {
  const native = new DatabaseSync(":memory:");
  for (const migration of migrations) native.exec(migration.sql);
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
  const repository = new LocalTransactionMutationRepository(
    database as unknown as SQLiteDatabase,
    new LocalDatabaseWriter(),
    () => crypto.randomUUID(),
    () => new Date("2026-08-13T16:00:00.000Z"),
    () => 0.5,
  );
  return { native, repository };
}

describe("account currency chosen at creation", () => {
  it("is kept on the local row and in the queued create, even after an edit before sync", async () => {
    const { native, repository } = createRepository();
    const id = await repository.createAccount({
      name: "Dollar wallet",
      type: "cash",
      currency: "USD",
    });
    await repository.updateAccount(id, { name: "Dollar wallet 2" });

    expect(native.prepare("SELECT currency FROM accounts WHERE id = ?").get(id)).toEqual({
      currency: "USD",
    });
    const outbox = native
      .prepare("SELECT operation_type, payload_json FROM sync_outbox WHERE entity_id = ?")
      .get(id) as { operation_type: string; payload_json: string };
    expect(outbox.operation_type).toBe("create");
    expect(JSON.parse(outbox.payload_json)).toEqual({
      name: "Dollar wallet 2",
      type: "cash",
      currency: "USD",
    });
  });

  it("falls back to the workspace currency when none is chosen", async () => {
    const { native, repository } = createRepository();
    const id = await repository.createAccount({ name: "Peso wallet", type: "cash" }, "USD");

    expect(native.prepare("SELECT currency FROM accounts WHERE id = ?").get(id)).toEqual({
      currency: "USD",
    });
  });
});
