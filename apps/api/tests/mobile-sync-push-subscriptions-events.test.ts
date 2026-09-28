import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMobileSyncRepository } from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

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
