import { describe, expect, it } from "vitest";

import {
  mobileSyncPullRequestSchema,
  mobileSyncPushRequestSchema,
  mobileSyncPushResponseSchema,
} from "../src/sync";

const clientId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const entityId = "00000000-0000-4000-8000-000000000003";
const idempotencyKey = "00000000-0000-4000-8000-000000000004";

describe("mobile sync boundary schemas", () => {
  it("rejects client-controlled tenant fields and malformed cursors", () => {
    expect(
      mobileSyncPullRequestSchema.safeParse({ protocolVersion: 1, tenantId: "other-tenant" })
        .success,
    ).toBe(false);
    expect(
      mobileSyncPullRequestSchema.safeParse({ protocolVersion: 1, cursor: "123" }).success,
    ).toBe(false);
  });

  it("requires UUIDs and revision zero for an offline create", () => {
    const valid = {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId,
          idempotencyKey,
          entityType: "account",
          entityId,
          operationType: "create",
          baseRevision: 0,
          payload: { name: "Wallet", type: "cash" },
          dependencyIds: [],
        },
      ],
    };

    expect(mobileSyncPushRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      mobileSyncPushRequestSchema.safeParse({
        ...valid,
        operations: [{ ...valid.operations[0], entityId: "account-local", baseRevision: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate operation IDs and self dependencies", () => {
    const operation = {
      operationId,
      idempotencyKey,
      entityType: "transaction" as const,
      entityId,
      operationType: "delete" as const,
      baseRevision: 2,
      payload: {},
      dependencyIds: [operationId],
    };
    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [operation, operation],
      }).success,
    ).toBe(false);
  });

  it("requires dependencies to appear earlier in the same batch", () => {
    const dependent = {
      operationId: "00000000-0000-4000-8000-000000000010",
      idempotencyKey: "00000000-0000-4000-8000-000000000011",
      entityType: "transaction" as const,
      entityId: "00000000-0000-4000-8000-000000000012",
      operationType: "create" as const,
      baseRevision: 0 as const,
      payload: {
        kind: "expense" as const,
        accountId: entityId,
        categoryId: "category-1",
        date: "2026-08-13",
        description: "Dependent purchase",
        amountMinor: 1_000,
        currency: "PHP" as const,
      },
      dependencyIds: [operationId],
    };
    const parent = {
      operationId,
      idempotencyKey,
      entityType: "account" as const,
      entityId,
      operationType: "create" as const,
      baseRevision: 0 as const,
      payload: { name: "Offline wallet", type: "cash" as const },
      dependencyIds: [],
    };

    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [parent, dependent],
      }).success,
    ).toBe(true);
    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [dependent, parent],
      }).success,
    ).toBe(false);
    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [{ ...dependent, dependencyIds: [crypto.randomUUID()] }],
      }).success,
    ).toBe(false);
  });

  it("keeps transfers out of non-atomic transaction creates", () => {
    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [
          {
            operationId,
            idempotencyKey,
            entityType: "transaction",
            entityId,
            operationType: "create",
            baseRevision: 0,
            dependencyIds: [],
            payload: {
              kind: "transfer",
              date: "2026-08-13",
              description: "Savings",
              amountMinor: 10_000,
              currency: "PHP",
              categoryId: "transfer",
              fromAccountId: "wallet",
              toAccountId: "savings",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts one logical atomic transfer command with client-generated leg IDs", () => {
    expect(
      mobileSyncPushRequestSchema.safeParse({
        protocolVersion: 1,
        clientId,
        operations: [
          {
            operationId,
            idempotencyKey,
            entityType: "transfer",
            entityId,
            operationType: "create",
            baseRevision: 0,
            dependencyIds: [],
            payload: {
              fromTransactionId: "00000000-0000-4000-8000-000000000005",
              toTransactionId: "00000000-0000-4000-8000-000000000006",
              transfer: {
                kind: "transfer",
                date: "2026-08-13",
                description: "Savings",
                amountMinor: 10_000,
                transferFeeMinor: 100,
                currency: "PHP",
                categoryId: "transfer",
                fromAccountId: "wallet",
                toAccountId: "savings",
              },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates acknowledged server revisions", () => {
    expect(
      mobileSyncPushResponseSchema.safeParse({
        protocolVersion: 1,
        results: [
          {
            operationId,
            entityType: "transaction",
            entityId,
            status: "acknowledged",
            revision: 2,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a conflict snapshot whose entity type does not match", () => {
    expect(
      mobileSyncPushResponseSchema.safeParse({
        protocolVersion: 1,
        results: [
          {
            operationId,
            entityType: "transaction",
            entityId,
            status: "conflict",
            code: "stale_revision",
            serverRevision: 2,
            serverUpdatedAt: "2026-08-13 16:00:00",
            serverPayload: {
              id: entityId,
              name: "Wrong entity",
              type: "cash",
              currency: "PHP",
              archived: false,
              system: false,
              interest: {
                enabled: false,
                annualRateBasisPoints: null,
                frequency: null,
                payDay: null,
              },
              revision: 2,
              updatedAt: "2026-08-13 16:00:00",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
