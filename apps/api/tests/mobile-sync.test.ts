import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import { d1FromSqlite } from "./helpers/d1-test-harness";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
  grantMobileSyncTestPro,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

describe("mobile sync account and category push repository", () => {
  const clientId = "10000000-0000-4000-8000-000000000001";

  it("creates, updates, and archives a client-ID account idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "10000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-000000000003",
          idempotencyKey: "10000000-0000-4000-8000-000000000004",
          entityType: "account" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Offline savings", type: "savings" as const },
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
          operationId: "10000000-0000-4000-8000-000000000005",
          idempotencyKey: "10000000-0000-4000-8000-000000000006",
          entityType: "account",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Emergency savings", type: "savings" },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });

    const archived = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-000000000007",
          idempotencyKey: "10000000-0000-4000-8000-000000000008",
          entityType: "account",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(archived.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT name, archived, revision FROM accounts WHERE id = ?").get(entityId),
    ).toEqual({ name: "Emergency savings", archived: 1, revision: 3 });
    expect(
      database
        .prepare(
          "SELECT operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ operation: "upsert" });
  });

  it("updates automatic-interest settings atomically with account updates", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(async (bindings, tenantId) =>
      Boolean(
        await bindings.DB.prepare(
          "SELECT 1 AS entitled FROM effective_pro_access WHERE tenant_id = ?",
        )
          .bind(tenantId)
          .first(),
      ),
    );
    const interest = {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly" as const,
      payDay: 15,
    };

    const notSavings = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a1",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a2",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", interest },
        },
      ],
    });
    expect(notSavings.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
    expect(
      database.prepare("SELECT interest_enabled FROM accounts WHERE id = 'account-1'").get(),
    ).toEqual({ interest_enabled: 0 });

    const freeAttempt = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a3",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a4",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", type: "savings", interest },
        },
      ],
    });
    expect(freeAttempt.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });
    expect(
      database.prepare("SELECT type, interest_enabled FROM accounts WHERE id = 'account-1'").get(),
    ).toEqual({ type: "cash", interest_enabled: 0 });

    grantMobileSyncTestPro(database, "tenant-1");
    const pro = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a5",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a6",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", type: "savings", interest },
        },
      ],
    });
    expect(pro.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT type, interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day FROM accounts WHERE id = 'account-1'",
        )
        .get(),
    ).toEqual({
      type: "savings",
      interest_enabled: 1,
      annual_rate_basis_points: 500,
      interest_frequency: "monthly",
      interest_pay_day: 15,
    });

    const pulled = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: "v1.8",
      limit: 20,
    });
    const accountChange = pulled.changes.find(
      (change) => change.entityType === "account" && change.entityId === "account-1",
    );
    expect(accountChange?.payload).toMatchObject({
      type: "savings",
      interest: { enabled: true, annualRateBasisPoints: 500, frequency: "monthly", payDay: 15 },
    });

    const disabled = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a7",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a8",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: {
            name: "Wallet",
            interest: {
              enabled: false,
              annualRateBasisPoints: 0,
              frequency: "monthly",
              payDay: 15,
            },
          },
        },
      ],
    });
    expect(disabled.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database
        .prepare(
          "SELECT interest_enabled, annual_rate_basis_points FROM accounts WHERE id = 'account-1'",
        )
        .get(),
    ).toEqual({ interest_enabled: 0, annual_rate_basis_points: 0 });

    const createdId = "10000000-0000-4000-8000-0000000000ab";
    const created = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000ac",
          idempotencyKey: "10000000-0000-4000-8000-0000000000ad",
          entityType: "account",
          entityId: createdId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Goal fund", type: "savings", interest },
        },
      ],
    });
    expect(created.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          "SELECT interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day FROM accounts WHERE id = ?",
        )
        .get(createdId),
    ).toEqual({
      interest_enabled: 1,
      annual_rate_basis_points: 500,
      interest_frequency: "monthly",
      interest_pay_day: 15,
    });

    const createFreeAttempt = await repository.push(env, "tenant-2", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000ae",
          idempotencyKey: "10000000-0000-4000-8000-0000000000af",
          entityType: "account",
          entityId: "10000000-0000-4000-8000-0000000000b0",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Free savings", type: "savings", interest },
        },
      ],
    });
    expect(createFreeAttempt.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });
    expect(
      database
        .prepare("SELECT id FROM accounts WHERE id = '10000000-0000-4000-8000-0000000000b0'")
        .get(),
    ).toBeUndefined();
  });

  it("protects account names, system rows, revisions, and tenant ownership", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE accounts SET system_key = ? WHERE id = ?").run("cash", "account-1");

    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000001",
          idempotencyKey: "11000000-0000-4000-8000-000000000002",
          entityType: "account",
          entityId: "11000000-0000-4000-8000-000000000003",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "wallet", type: "cash" },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });

    const protectedEdit = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000004",
          idempotencyKey: "11000000-0000-4000-8000-000000000005",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { name: "Renamed system account" },
        },
      ],
    });
    expect(protectedEdit.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });

    database.prepare("UPDATE accounts SET type = ? WHERE id = ?").run("checking", "account-1");
    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000006",
          idempotencyKey: "11000000-0000-4000-8000-000000000007",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { name: "Wallet", type: "cash" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 3,
      serverPayload: { type: "checking" },
    });

    const otherTenant = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000008",
          idempotencyKey: "11000000-0000-4000-8000-000000000009",
          entityType: "account",
          entityId: "account-2",
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(otherTenant.results[0]).toMatchObject({
      status: "conflict",
      code: "entity_missing",
      serverPayload: null,
    });
  });

  it("enforces Free and Pro category creation atomically and preserves archive semantics", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(async (bindings, tenantId) =>
      Boolean(
        await bindings.DB.prepare(
          "SELECT 1 AS entitled FROM effective_pro_access WHERE tenant_id = ?",
        )
          .bind(tenantId)
          .first(),
      ),
    );
    const freeCategoryId = "12000000-0000-4000-8000-000000000001";
    const free = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000002",
          idempotencyKey: "12000000-0000-4000-8000-000000000003",
          entityType: "category",
          entityId: freeCategoryId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Offline needs", kind: "expense", color: "#0F766E" },
        },
      ],
    });
    expect(free.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database.prepare("SELECT required_plan FROM categories WHERE id = ?").get(freeCategoryId),
    ).toEqual({ required_plan: "free" });

    for (const [name, id, op, key] of [
      [
        "Second free",
        "12000000-0000-4000-8000-000000000006",
        "12000000-0000-4000-8000-000000000004",
        "12000000-0000-4000-8000-000000000005",
      ],
      [
        "Third free",
        "12000000-0000-4000-8000-00000000000a",
        "12000000-0000-4000-8000-00000000000b",
        "12000000-0000-4000-8000-00000000000c",
      ],
      [
        "Fourth free",
        "12000000-0000-4000-8000-00000000000d",
        "12000000-0000-4000-8000-00000000000e",
        "12000000-0000-4000-8000-00000000000f",
      ],
    ] as const) {
      const result = await repository.push(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        operations: [
          {
            operationId: op,
            idempotencyKey: key,
            entityType: "category",
            entityId: id,
            operationType: "create",
            baseRevision: 0,
            dependencyIds: [],
            payload: { name, kind: "expense", color: "#1D4ED8" },
          },
        ],
      });
      expect(result.results[0]).toMatchObject({ status: "acknowledged" });
    }

    const limited = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000014",
          idempotencyKey: "12000000-0000-4000-8000-000000000015",
          entityType: "category",
          entityId: "12000000-0000-4000-8000-000000000016",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Fifth free", kind: "expense", color: "#1D4ED8" },
        },
      ],
    });
    expect(limited.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });

    grantMobileSyncTestPro(database, "tenant-1");
    const proCategoryId = "12000000-0000-4000-8000-000000000007";
    const pro = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000008",
          idempotencyKey: "12000000-0000-4000-8000-000000000009",
          entityType: "category",
          entityId: proCategoryId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Pro wants", kind: "expense", color: "#7C3AED" },
        },
      ],
    });
    expect(pro.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database.prepare("SELECT required_plan FROM categories WHERE id = ?").get(proCategoryId),
    ).toEqual({ required_plan: "zoption_pro" });

    const archived = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000010",
          idempotencyKey: "12000000-0000-4000-8000-000000000011",
          entityType: "category",
          entityId: proCategoryId,
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(archived.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT archived, revision FROM categories WHERE id = ?").get(proCategoryId),
    ).toEqual({ archived: 1, revision: 2 });
  });

  it("rejects category name collisions, protected rows, and dependency graphs fail-closed", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE categories SET system_key = ? WHERE id = ?")
      .run("expense", "category-1");

    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000001",
          idempotencyKey: "13000000-0000-4000-8000-000000000002",
          entityType: "category",
          entityId: "13000000-0000-4000-8000-000000000003",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "dining", kind: "income", color: "#111827" },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });

    const protectedCategory = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000004",
          idempotencyKey: "13000000-0000-4000-8000-000000000005",
          entityType: "category",
          entityId: "category-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { color: "#FFFFFF" },
        },
      ],
    });
    expect(protectedCategory.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });

    const dependentId = "13000000-0000-4000-8000-000000000006";
    const dependent = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000007",
          idempotencyKey: "13000000-0000-4000-8000-000000000008",
          entityType: "account",
          entityId: dependentId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: ["13000000-0000-4000-8000-000000000009"],
          payload: { name: "Dependent account", type: "cash" },
        },
      ],
    });
    expect(dependent.results[0]).toMatchObject({
      status: "rejected",
      code: "unsupported_operation",
    });
    expect(
      database.prepare("SELECT id FROM accounts WHERE id = ?").get(dependentId),
    ).toBeUndefined();
  });

  it("commits new references and their dependent transaction as one idempotent graph", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const accountId = "15000000-0000-4000-8000-000000000001";
    const categoryId = "15000000-0000-4000-8000-000000000002";
    const transactionId = "15000000-0000-4000-8000-000000000003";
    const accountOperationId = "15000000-0000-4000-8000-000000000004";
    const categoryOperationId = "15000000-0000-4000-8000-000000000005";
    const input = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: accountOperationId,
          idempotencyKey: "15000000-0000-4000-8000-000000000006",
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Graph wallet", type: "cash" as const },
        },
        {
          operationId: categoryOperationId,
          idempotencyKey: "15000000-0000-4000-8000-000000000007",
          entityType: "category" as const,
          entityId: categoryId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Graph dining", kind: "expense" as const, color: "#0F766E" },
        },
        {
          operationId: "15000000-0000-4000-8000-000000000008",
          idempotencyKey: "15000000-0000-4000-8000-000000000009",
          entityType: "transaction" as const,
          entityId: transactionId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId, categoryOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId,
            date: "2026-08-13",
            description: "Atomic graph purchase",
            amountMinor: 5_000,
            currency: "PHP" as const,
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", input);
    expect(await repository.push(env, "tenant-1", input)).toEqual(first);
    expect(first.results).toMatchObject([
      { status: "acknowledged", revision: 1 },
      { status: "acknowledged", revision: 1 },
      { status: "acknowledged", revision: 1 },
    ]);
    expect(database.prepare("SELECT name FROM accounts WHERE id = ?").get(accountId)).toEqual({
      name: "Graph wallet",
    });
    expect(database.prepare("SELECT name FROM categories WHERE id = ?").get(categoryId)).toEqual({
      name: "Graph dining",
    });
    expect(
      database
        .prepare("SELECT account_id, category_id, amount_minor FROM transactions WHERE id = ?")
        .get(transactionId),
    ).toEqual({ account_id: accountId, category_id: categoryId, amount_minor: -5_000 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_idempotency WHERE tenant_id = ?")
        .get("tenant-1"),
    ).toEqual({ count: 3 });
  });

  it("rejects disconnected dependency graphs as one unsupported atomic batch", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const accountIds = [crypto.randomUUID(), crypto.randomUUID()];
    const operations = accountIds.flatMap((accountId, index) => {
      const accountOperationId = crypto.randomUUID();
      return [
        {
          operationId: accountOperationId,
          idempotencyKey: crypto.randomUUID(),
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: `Disconnected wallet ${index}`, type: "cash" as const },
        },
        {
          operationId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          entityType: "transaction" as const,
          entityId: crypto.randomUUID(),
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId: "category-1",
            date: "2026-08-14",
            description: `Disconnected purchase ${index}`,
            amountMinor: 1_000,
            currency: "PHP" as const,
          },
        },
      ];
    });

    const result = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations,
    });
    expect(result.results).toHaveLength(4);
    expect(result.results.every((item) => item.status === "rejected")).toBe(true);
    expect(result.results).toMatchObject([
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
    ]);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM accounts WHERE id IN (?, ?)")
        .get(...accountIds),
    ).toEqual({ count: 0 });
  });

  it("rolls back every graph mutation when a guarded statement loses a race", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const accountId = "16000000-0000-4000-8000-000000000001";
    const accountOperationId = "16000000-0000-4000-8000-000000000002";
    let injectRace = true;
    env.DB = d1FromSqlite(database, () => {
      if (!injectRace) return;
      injectRace = false;
      database
        .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
        .run("race-account", "tenant-1", "Raced graph wallet", "cash");
    });
    const input = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: accountOperationId,
          idempotencyKey: "16000000-0000-4000-8000-000000000003",
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Raced graph wallet", type: "cash" as const },
        },
        {
          operationId: "16000000-0000-4000-8000-000000000004",
          idempotencyKey: "16000000-0000-4000-8000-000000000005",
          entityType: "transaction" as const,
          entityId: "16000000-0000-4000-8000-000000000006",
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId: "category-1",
            date: "2026-08-13",
            description: "Must not commit",
            amountMinor: 1_000,
            currency: "PHP" as const,
          },
        },
      ],
    };

    await expect(repository.push(env, "tenant-1", input)).rejects.toThrow(
      "rolled back before acknowledgement",
    );
    expect(database.prepare("SELECT id FROM accounts WHERE id = ?").get(accountId)).toBeUndefined();
    expect(
      database
        .prepare("SELECT id FROM transactions WHERE id = ?")
        .get("16000000-0000-4000-8000-000000000006"),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_idempotency WHERE tenant_id = ?")
        .get("tenant-1"),
    ).toEqual({ count: 0 });

    const retry = await repository.push(env, "tenant-1", input);
    expect(retry.results).toMatchObject([
      { status: "rejected", code: "invalid_operation" },
      { status: "rejected", code: "dependency_failed" },
    ]);
  });

  it("returns an entitlement-derived category snapshot for stale conflicts", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE categories SET color = ? WHERE id = ?").run("#ABCDEF", "category-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "14000000-0000-4000-8000-000000000001",
          idempotencyKey: "14000000-0000-4000-8000-000000000002",
          entityType: "category",
          entityId: "category-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { color: "#FFFFFF" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { color: "#ABCDEF", requiredPlan: "zoption_pro", locked: true },
    });
  });
});

describe("mobile sync subscription push repository", () => {
  const clientId = "50000000-0000-4000-8000-000000000001";

  function insertFreeCategory(database: DatabaseSync): void {
    database
      .prepare(
        "INSERT INTO categories (id, tenant_id, name, kind, color, required_plan) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("category-sub", "tenant-1", "Utilities", "expense", "#333333", "free");
  }

  it("creates, updates, cancels, reactivates, and removes a scheduled subscription idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    insertFreeCategory(database);
    const entityId = "50000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000003",
          idempotencyKey: "50000000-0000-4000-8000-000000000004",
          entityType: "subscription" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "Netflix",
            amountMinor: 54_900,
            billingCycle: "monthly" as const,
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare("SELECT name, status, revision FROM subscriptions WHERE id = ?")
        .get(entityId),
    ).toEqual({ name: "Netflix", status: "active", revision: 1 });
    const charge = database
      .prepare(
        "SELECT id, amount_minor AS amountMinor, date, subscription_id AS subscriptionId FROM transactions WHERE subscription_id = ?",
      )
      .get(entityId) as { id: string; amountMinor: number; date: string; subscriptionId: string };
    expect(charge).toMatchObject({
      amountMinor: -54_900,
      date: "2026-09-01",
      subscriptionId: entityId,
    });
    const groups = database
      .prepare(
        "SELECT atomic_group_id AS atomicGroupId, sequence FROM mobile_sync_change_groups WHERE tenant_id = ? ORDER BY sequence DESC LIMIT 2",
      )
      .all("tenant-1") as Array<{ atomicGroupId: string; sequence: number }>;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.atomicGroupId).toBe(groups[1]!.atomicGroupId);
    expect(groups[0]!.sequence).toBe(groups[1]!.sequence + 1);

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000005",
          idempotencyKey: "50000000-0000-4000-8000-000000000006",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT amount_minor AS amountMinor, description FROM transactions WHERE subscription_id = ?",
        )
        .get(entityId),
    ).toEqual({ amountMinor: -74_900, description: "Netflix Premium" });

    const canceled = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000007",
          idempotencyKey: "50000000-0000-4000-8000-000000000008",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
            status: "canceled" as const,
          },
        },
      ],
    });
    expect(canceled.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    // Cancelling does not delete the transaction (no refund)
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 1 });

    const reactivated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000009",
          idempotencyKey: "50000000-0000-4000-8000-00000000000a",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 3,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
            status: "active" as const,
          },
        },
      ],
    });
    expect(reactivated.results[0]).toMatchObject({ status: "acknowledged", revision: 4 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 1 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-00000000000b",
          idempotencyKey: "50000000-0000-4000-8000-00000000000c",
          entityType: "subscription",
          entityId,
          operationType: "delete",
          baseRevision: 4,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 5 });
    expect(
      database.prepare("SELECT 1 AS found FROM subscriptions WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          "SELECT amount_minor AS amountMinor, subscription_id AS subscriptionId FROM transactions WHERE id = ?",
        )
        .get(charge.id),
    ).toEqual({ amountMinor: -74_900, subscriptionId: null });
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "subscription", operation: "delete" });
  });

  it("rejects a Pro category and an unowned account", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const proCategory = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-00000000000d",
          idempotencyKey: "50000000-0000-4000-8000-00000000000e",
          entityType: "subscription",
          entityId: "50000000-0000-4000-8000-00000000000f",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Pro Tool",
            amountMinor: 100_000,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-1",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(proCategory.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });

    const foreignAccount = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000010",
          idempotencyKey: "50000000-0000-4000-8000-000000000011",
          entityType: "subscription",
          entityId: "50000000-0000-4000-8000-000000000012",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Private Tool",
            amountMinor: 100_000,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-2",
            accountId: "account-2",
          },
        },
      ],
    });
    expect(foreignAccount.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_category",
    });
  });

  it("returns a stale revision conflict for an out-of-date subscription update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    insertFreeCategory(database);
    database
      .prepare("UPDATE subscriptions SET name = ? WHERE id = ?")
      .run("Server Name", "subscription-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000013",
          idempotencyKey: "50000000-0000-4000-8000-000000000014",
          entityType: "subscription",
          entityId: "subscription-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            name: "Device Name",
            amountMinor: 54_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "subscription-1", name: "Server Name", status: "canceled" },
    });
  });
});

describe("mobile sync event push repository", () => {
  const clientId = "60000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a calendar event idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "60000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000003",
          idempotencyKey: "60000000-0000-4000-8000-000000000004",
          entityType: "event" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            title: "Payday planning",
            date: "2026-08-30",
            startTime: "09:00",
            endTime: "10:00",
            notes: "Plan August allocations",
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          "SELECT title, date, start_time AS startTime, revision FROM calendar_events WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ title: "Payday planning", date: "2026-08-30", startTime: "09:00", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000005",
          idempotencyKey: "60000000-0000-4000-8000-000000000006",
          entityType: "event",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { title: "Payday review", startTime: null, endTime: null },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT title, start_time AS startTime, revision FROM calendar_events WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ title: "Payday review", startTime: null, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000007",
          idempotencyKey: "60000000-0000-4000-8000-000000000008",
          entityType: "event",
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
      database.prepare("SELECT 1 AS found FROM calendar_events WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "event", operation: "delete" });
  });

  it("rejects an update whose merged times are invalid", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));

    const badEnd = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000009",
          idempotencyKey: "60000000-0000-4000-8000-00000000000a",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { startTime: null, endTime: "21:00" },
        },
      ],
    });
    expect(badEnd.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT revision FROM calendar_events WHERE id = ?").get("event-1"),
    ).toEqual({ revision: 1 });

    const badOrder = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-00000000000b",
          idempotencyKey: "60000000-0000-4000-8000-00000000000c",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { startTime: "21:00", endTime: "20:00" },
        },
      ],
    });
    expect(badOrder.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT revision FROM calendar_events WHERE id = ?").get("event-1"),
    ).toEqual({ revision: 1 });
  });

  it("returns a stale revision conflict for an out-of-date event update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE calendar_events SET title = ? WHERE id = ?")
      .run("Anniversary", "event-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-00000000000d",
          idempotencyKey: "60000000-0000-4000-8000-00000000000e",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { title: "Dinner" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "event-1", title: "Anniversary" },
    });
  });
});
