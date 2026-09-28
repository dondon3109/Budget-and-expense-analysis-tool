import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

describe("mobile sync budget push repository", () => {
  const clientId = "20000000-0000-4000-8000-000000000001";

  it("creates and updates a month-scoped budget idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "20000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-000000000003",
          idempotencyKey: "20000000-0000-4000-8000-000000000004",
          entityType: "budget" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { categoryId: "category-1", month: "2026-09-01", limitMinor: 75_000 },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-000000000005",
          idempotencyKey: "20000000-0000-4000-8000-000000000006",
          entityType: "budget",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { limitMinor: 80_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare("SELECT limit_minor AS limitMinor, revision FROM budgets WHERE id = ?")
        .get(entityId),
    ).toEqual({ limitMinor: 80_000, revision: 2 });
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "budget", operation: "upsert" });
  });

  it("rejects a duplicate month-category budget as an entity_exists conflict", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-000000000007",
          idempotencyKey: "20000000-0000-4000-8000-000000000008",
          entityType: "budget",
          entityId: "20000000-0000-4000-8000-000000000009",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { categoryId: "category-1", month: "2026-08-01", limitMinor: 60_000 },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "conflict",
      code: "entity_exists",
      serverPayload: {
        id: "budget-1",
        categoryId: "category-1",
        month: "2026-08-01",
        limitMinor: 50_000,
        revision: 1,
      },
    });
  });

  it("rejects a budget for a category the tenant does not own", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const rejected = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-00000000000a",
          idempotencyKey: "20000000-0000-4000-8000-00000000000b",
          entityType: "budget",
          entityId: "20000000-0000-4000-8000-00000000000c",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { categoryId: "category-2", month: "2026-09-01", limitMinor: 10_000 },
        },
      ],
    });
    expect(rejected.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_category",
    });
  });

  it("returns a stale revision conflict for an out-of-date budget update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE budgets SET limit_minor = ? WHERE id = ?").run(90_000, "budget-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-00000000000d",
          idempotencyKey: "20000000-0000-4000-8000-00000000000e",
          entityType: "budget",
          entityId: "budget-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { limitMinor: 95_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "budget-1", limitMinor: 90_000 },
    });
  });
});

describe("mobile sync financial goal push repository", () => {
  const clientId = "30000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a goal idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "30000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000003",
          idempotencyKey: "30000000-0000-4000-8000-000000000004",
          entityType: "goal" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "House Fund",
            targetAmountMinor: 500_000,
            currentAmountMinor: 0,
            targetDate: "2027-12-31",
            status: "active" as const,
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000005",
          idempotencyKey: "30000000-0000-4000-8000-000000000006",
          entityType: "goal",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 120_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT current_amount_minor AS currentAmountMinor, revision FROM financial_goals WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ currentAmountMinor: 120_000, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000007",
          idempotencyKey: "30000000-0000-4000-8000-000000000008",
          entityType: "goal",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT 1 AS found FROM financial_goals WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "goal", operation: "delete" });
  });

  it("rejects a duplicate goal name", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000009",
          idempotencyKey: "30000000-0000-4000-8000-00000000000a",
          entityType: "goal",
          entityId: "30000000-0000-4000-8000-00000000000b",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Emergency Fund",
            targetAmountMinor: 200_000,
            currentAmountMinor: 0,
            targetDate: "2027-06-30",
            status: "active",
          },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("rejects an update whose current savings exceed the target", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const rejected = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-00000000000c",
          idempotencyKey: "30000000-0000-4000-8000-00000000000d",
          entityType: "goal",
          entityId: "goal-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 200_000 },
        },
      ],
    });
    expect(rejected.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("returns a stale revision conflict for an out-of-date goal update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE financial_goals SET current_amount_minor = ? WHERE id = ?")
      .run(50_000, "goal-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-00000000000e",
          idempotencyKey: "30000000-0000-4000-8000-00000000000f",
          entityType: "goal",
          entityId: "goal-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 60_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "goal-1", currentAmountMinor: 50_000 },
    });
  });
});

describe("mobile sync debt push repository", () => {
  const clientId = "40000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a debt idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "40000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000003",
          idempotencyKey: "40000000-0000-4000-8000-000000000004",
          entityType: "debt" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "Personal Loan",
            type: "personal_loan" as const,
            balanceMinor: 250_000,
            aprBasisPoints: 1_200,
            minimumPaymentMinor: 8_000,
            balanceAsOf: "2026-08-14",
            status: "active" as const,
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000005",
          idempotencyKey: "40000000-0000-4000-8000-000000000006",
          entityType: "debt",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { balanceMinor: 200_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare("SELECT balance_minor AS balanceMinor, revision FROM debts WHERE id = ?")
        .get(entityId),
    ).toEqual({ balanceMinor: 200_000, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000007",
          idempotencyKey: "40000000-0000-4000-8000-000000000008",
          entityType: "debt",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT 1 AS found FROM debts WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "debt", operation: "delete" });
  });

  it("rejects a duplicate debt name case-insensitively", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000009",
          idempotencyKey: "40000000-0000-4000-8000-00000000000a",
          entityType: "debt",
          entityId: "40000000-0000-4000-8000-00000000000b",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "CAR LOAN",
            type: "auto_loan",
            balanceMinor: 100_000,
            aprBasisPoints: 0,
            minimumPaymentMinor: 0,
            balanceAsOf: "2026-08-14",
            status: "active",
          },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("returns a stale revision conflict for an out-of-date debt update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE debts SET balance_minor = ? WHERE id = ?").run(450_000, "debt-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-00000000000c",
          idempotencyKey: "40000000-0000-4000-8000-00000000000d",
          entityType: "debt",
          entityId: "debt-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { balanceMinor: 420_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "debt-1", balanceMinor: 450_000 },
    });
  });
});
