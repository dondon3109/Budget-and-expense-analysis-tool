import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

const clientId = "40000000-0000-4000-8000-000000000001";
const debtLinks = new Set(["debt-links", "account-types-v2"] as const);

let sequence = 0;
function ids() {
  sequence += 1;
  const suffix = String(sequence).padStart(4, "0");
  return {
    operationId: `40000000-0000-4000-8000-00000001${suffix}`,
    idempotencyKey: `40000000-0000-4000-8000-00000002${suffix}`,
  };
}

function debtBalance(database: DatabaseSync): number {
  return (
    database.prepare("SELECT balance_minor AS balance FROM debts WHERE id = 'debt-1'").get() as {
      balance: number;
    }
  ).balance;
}

describe("mobile sync debt links", () => {
  const expenseId = "40000000-0000-4000-8000-000000000002";

  function expense(amountMinor: number) {
    return {
      kind: "expense" as const,
      date: "2026-08-15",
      description: "Car loan payment",
      amountMinor,
      currency: "PHP" as const,
      categoryId: "category-1",
      accountId: "account-1",
      debtId: "debt-1",
    };
  }

  it("pays down a debt from a pushed expense and gives it back on edit and delete", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));

    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transaction",
          entityId: expenseId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: expense(100_000),
        },
      ],
    });
    expect(debtBalance(database)).toBe(400_000);

    // A stale edit lands nowhere, so the debt keeps the balance it had.
    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transaction",
          entityId: expenseId,
          operationType: "update",
          baseRevision: 7,
          dependencyIds: [],
          payload: { amountMinor: 1 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({ status: "conflict" });
    expect(debtBalance(database)).toBe(400_000);

    // An edit from a client that predates debt links keeps the link and re-prices it.
    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transaction",
          entityId: expenseId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { amountMinor: 60_000 },
        },
      ],
    });
    expect(debtBalance(database)).toBe(440_000);

    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transaction",
          entityId: expenseId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(debtBalance(database)).toBe(500_000);
  });

  it("pays a debt with a transfer into a liability account by what reached it", async () => {
    const { env, database } = createSyncEnvironment();
    database.exec(`
      INSERT INTO accounts (id, tenant_id, name, type) VALUES ('account-loan', 'tenant-1', 'Loan', 'payable');
      INSERT INTO categories (id, tenant_id, name, kind, color)
        VALUES ('category-transfer', 'tenant-1', 'Transfer', 'transfer', '#008877');
    `);
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const groupId = "40000000-0000-4000-8000-000000000010";
    const transfer = {
      kind: "transfer" as const,
      date: "2026-08-15",
      description: "Loan payment",
      amountMinor: 50_500,
      transferFeeMinor: 500,
      currency: "PHP" as const,
      categoryId: "category-transfer",
      fromAccountId: "account-1",
      toAccountId: "account-loan",
    };

    const created = await repository.push(
      env,
      "tenant-1",
      {
        protocolVersion: 1,
        clientId,
        operations: [
          {
            ...ids(),
            entityType: "transfer",
            entityId: groupId,
            operationType: "create",
            baseRevision: 0,
            dependencyIds: [],
            payload: {
              fromTransactionId: "40000000-0000-4000-8000-000000000011",
              toTransactionId: "40000000-0000-4000-8000-000000000012",
              transfer: { ...transfer, debtId: "debt-1" },
            },
          },
        ],
      },
      debtLinks,
    );
    expect(created.results[0]).toMatchObject({ status: "acknowledged" });
    expect(debtBalance(database)).toBe(450_000);

    // Without debtId the edit keeps the link while the money still goes to the loan.
    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transfer",
          entityId: groupId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { transfer: { ...transfer, amountMinor: 20_500 } },
        },
      ],
    });
    expect(debtBalance(database)).toBe(480_000);

    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          ...ids(),
          entityType: "transfer",
          entityId: groupId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(debtBalance(database)).toBe(500_000);
  });

  it("sends debt links and newer account types only to clients that ask for them", async () => {
    const { env, database } = createSyncEnvironment();
    database.exec(`
      INSERT INTO accounts (id, tenant_id, name, type) VALUES ('account-loan', 'tenant-1', 'Loan', 'payable');
      UPDATE transactions SET debt_id = 'debt-1' WHERE id = 'transaction-1';
    `);
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const request = { protocolVersion: 1 as const, cursor: null, limit: 200 };

    const current = await repository.pull(env, "tenant-1", request, debtLinks);
    const legacy = await repository.pull(env, "tenant-1", request);

    const latest = (changes: typeof current.changes, entityId: string) =>
      changes.filter((change) => change.entityId === entityId).at(-1)?.payload;
    expect(latest(current.changes, "transaction-1")).toMatchObject({ debtId: "debt-1" });
    expect(latest(legacy.changes, "transaction-1")).not.toHaveProperty("debtId");
    expect(latest(current.changes, "account-loan")).toMatchObject({ type: "payable" });
    expect(latest(legacy.changes, "account-loan")).toMatchObject({ type: "other" });
  });
});
