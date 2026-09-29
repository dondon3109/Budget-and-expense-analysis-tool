import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { SQLiteDatabase } from "expo-sqlite";

import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { LocalDatabaseWriter } from "../../database-writer";
import { migrations } from "../../migrations";
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
  () => new Date("2026-08-13T16:00:00.000Z"),
  () => 0.5,
);

const subscription = {
  name: "Notion",
  amountMinor: 1_000,
  billingCycle: "monthly" as const,
  nextBillingDate: "2026-09-01",
  categoryId: "category-1",
  accountId: "account-1",
};

function stored(id: string) {
  const row = native.prepare("SELECT currency FROM subscriptions WHERE id = ?").get(id) as {
    currency: string;
  };
  const outbox = native
    .prepare(
      "SELECT payload_json FROM sync_outbox WHERE entity_id = ? ORDER BY created_sequence DESC",
    )
    .get(id) as { payload_json: string };
  return { row: row.currency, payload: JSON.parse(outbox.payload_json).currency };
}

beforeAll(() => {
  native.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) native.exec(migration.sql);
  native.exec(`
    INSERT INTO accounts (id, name, type, currency, archived, system, server_revision, sync_state)
      VALUES ('account-1', 'Wallet', 'cash', 'USD', 0, 0, 1, 'synced');
    INSERT INTO categories (
      id, name, kind, color, archived, system, origin, required_plan, locked, server_revision, sync_state
    ) VALUES ('category-1', 'Dining', 'expense', '#123456', 0, 0, 'custom', 'free', 0, 1, 'synced');
  `);
});

afterAll(() => native.close());
afterEach(() => useWorkspaceCurrencyStore.setState({ currency: "PHP" }));

describe("subscription currency", () => {
  it("writes the chosen currency to the row and the outbox payload", async () => {
    const id = await mutations.createSubscription({ ...subscription, currency: "USD" });
    expect(stored(id)).toEqual({ row: "USD", payload: "USD" });
  });

  it("defaults to the workspace currency when none is chosen", async () => {
    useWorkspaceCurrencyStore.setState({ currency: "USD" });
    const id = await mutations.createSubscription(subscription);
    expect(stored(id)).toEqual({ row: "USD", payload: "USD" });
  });

  it("keeps the stored currency on update unless a new one is sent", async () => {
    const id = await mutations.createSubscription({ ...subscription, currency: "USD" });
    native.exec(`UPDATE subscriptions SET sync_state = 'synced' WHERE id = '${id}'`);
    native.exec(`DELETE FROM sync_outbox WHERE entity_id = '${id}'`);
    await mutations.updateSubscription(id, { ...subscription, name: "Notion Plus" });
    expect(stored(id)).toEqual({ row: "USD", payload: "USD" });

    native.exec(`UPDATE subscriptions SET sync_state = 'synced' WHERE id = '${id}'`);
    native.exec(`DELETE FROM sync_outbox WHERE entity_id = '${id}'`);
    await mutations.updateSubscription(id, { ...subscription, currency: "PHP" });
    expect(stored(id)).toEqual({ row: "PHP", payload: "PHP" });
  });
});
