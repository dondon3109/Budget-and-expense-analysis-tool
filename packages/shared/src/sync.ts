import { z } from "zod";

import {
  accountInputSchema,
  accountUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  isoDateSchema,
  resourceIdSchema,
  transactionInputSchema,
  transactionUpdateSchema,
} from "./schemas";
import {
  accountTypes,
  categoryOrigins,
  categoryRequiredPlans,
  currencies,
  interestFrequencies,
  transactionKinds,
} from "./types";

export const MOBILE_SYNC_PROTOCOL_VERSION = 1 as const;
export const mobileSyncEntityTypes = ["account", "category", "transaction", "transfer"] as const;
export const mobileSyncOperationTypes = ["create", "update", "delete"] as const;

const uuidSchema = z.string().uuid();
const serverRevisionSchema = z.number().int().positive();
const serverTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?$/);

export const mobileSyncCursorSchema = z
  .string()
  .regex(/^v1\.[0-9a-z]+$/)
  .max(40);

export const mobileSyncAccountSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(80),
    type: z.enum(accountTypes),
    currency: z.enum(currencies),
    archived: z.boolean(),
    system: z.boolean(),
    interest: z
      .object({
        enabled: z.boolean(),
        annualRateBasisPoints: z.number().int().min(0).max(1_000_000).nullable(),
        frequency: z.enum(interestFrequencies).nullable(),
        payDay: z.number().int().min(1).max(31).nullable(),
      })
      .strict(),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncCategorySnapshotSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(80),
    kind: z.enum(transactionKinds),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    archived: z.boolean(),
    system: z.boolean(),
    origin: z.enum(categoryOrigins),
    requiredPlan: z.enum(categoryRequiredPlans),
    locked: z.boolean(),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncTransactionSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    accountId: resourceIdSchema.nullable(),
    categoryId: resourceIdSchema,
    date: isoDateSchema,
    description: z.string().max(240),
    amountMinor: z.number().int().safe(),
    currency: z.enum(currencies),
    kind: z.enum(transactionKinds),
    notes: z.string().max(500).nullable(),
    transferGroupId: resourceIdSchema.nullable(),
    transferFeeMinor: z.number().int().safe().min(0).nullable(),
    importFingerprint: z.string().max(200).nullable(),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncSnapshotSchema = z.union([
  mobileSyncAccountSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
]);

export const mobileSyncChangeSchema = z
  .object({
    entityType: z.enum(mobileSyncEntityTypes).exclude(["transfer"]),
    entityId: resourceIdSchema,
    revision: serverRevisionSchema,
    operation: z.enum(["upsert", "delete"]),
    serverUpdatedAt: serverTimestampSchema,
    payload: mobileSyncSnapshotSchema.nullable(),
  })
  .strict()
  .superRefine((change, context) => {
    if (change.operation === "delete" && change.payload !== null) {
      context.addIssue({ code: "custom", path: ["payload"], message: "Deletes use tombstones." });
      return;
    }
    if (change.operation === "upsert" && change.payload === null) {
      context.addIssue({ code: "custom", path: ["payload"], message: "Upserts include a row." });
      return;
    }
    if (change.payload && change.payload.id !== change.entityId) {
      context.addIssue({ code: "custom", path: ["payload", "id"], message: "Row ID mismatch." });
    }
    if (change.payload) {
      const expectedSchema =
        change.entityType === "account"
          ? mobileSyncAccountSnapshotSchema
          : change.entityType === "category"
            ? mobileSyncCategorySnapshotSchema
            : mobileSyncTransactionSnapshotSchema;
      if (!expectedSchema.safeParse(change.payload).success) {
        context.addIssue({
          code: "custom",
          path: ["payload"],
          message: "Row shape does not match its entity type.",
        });
      }
    }
  });

export const mobileSyncPullRequestSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    cursor: mobileSyncCursorSchema.nullable().default(null),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict();

export const mobileSyncPullResponseSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    changes: z.array(mobileSyncChangeSchema).max(200),
    nextCursor: mobileSyncCursorSchema,
    hasMore: z.boolean(),
  })
  .strict();

const operationIdentityShape = {
  operationId: uuidSchema,
  idempotencyKey: uuidSchema,
  entityId: resourceIdSchema,
  dependencyIds: z.array(uuidSchema).max(20).default([]),
} as const;

const createOperation = <T extends z.ZodType>(
  entityType: "account" | "category" | "transaction",
  payload: T,
) =>
  z
    .object({
      ...operationIdentityShape,
      entityType: z.literal(entityType),
      operationType: z.literal("create"),
      baseRevision: z.literal(0),
      payload,
    })
    .strict();

const updateOperation = <T extends z.ZodType>(
  entityType: "account" | "category" | "transaction",
  payload: T,
) =>
  z
    .object({
      ...operationIdentityShape,
      entityType: z.literal(entityType),
      operationType: z.literal("update"),
      baseRevision: serverRevisionSchema,
      payload,
    })
    .strict();

const deleteOperation = (entityType: "account" | "category" | "transaction") =>
  z
    .object({
      ...operationIdentityShape,
      entityType: z.literal(entityType),
      operationType: z.literal("delete"),
      baseRevision: serverRevisionSchema,
      payload: z.object({}).strict(),
    })
    .strict();

export const mobileSyncPushOperationSchema = z
  .union([
    createOperation("account", accountInputSchema),
    updateOperation("account", accountUpdateSchema),
    deleteOperation("account"),
    createOperation("category", categoryInputSchema),
    updateOperation("category", categoryUpdateSchema),
    deleteOperation("category"),
    createOperation("transaction", transactionInputSchema),
    updateOperation("transaction", transactionUpdateSchema),
    deleteOperation("transaction"),
  ])
  .superRefine((operation, context) => {
    if (operation.dependencyIds.includes(operation.operationId)) {
      context.addIssue({
        code: "custom",
        path: ["dependencyIds"],
        message: "An operation cannot depend on itself.",
      });
    }
    if (new Set(operation.dependencyIds).size !== operation.dependencyIds.length) {
      context.addIssue({
        code: "custom",
        path: ["dependencyIds"],
        message: "Dependencies must be unique.",
      });
    }
    if (operation.operationType === "create" && !uuidSchema.safeParse(operation.entityId).success) {
      context.addIssue({
        code: "custom",
        path: ["entityId"],
        message: "New mobile entities use client-generated UUIDs.",
      });
    }
    const transactionCreate =
      operation.entityType === "transaction" && operation.operationType === "create"
        ? transactionInputSchema.safeParse(operation.payload)
        : null;
    if (transactionCreate?.success && transactionCreate.data.kind === "transfer") {
      context.addIssue({
        code: "custom",
        path: ["entityType"],
        message: "Transfers use the atomic transfer command.",
      });
    }
  });

export const mobileSyncPushRequestSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    clientId: uuidSchema,
    operations: z.array(mobileSyncPushOperationSchema).min(1).max(50),
  })
  .strict()
  .superRefine((request, context) => {
    const operationIds = request.operations.map((operation) => operation.operationId);
    if (new Set(operationIds).size !== operationIds.length) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Operation IDs must be unique within a batch.",
      });
    }
  });

export type MobileSyncChange = z.infer<typeof mobileSyncChangeSchema>;
export type MobileSyncPullRequest = z.infer<typeof mobileSyncPullRequestSchema>;
export type MobileSyncPullResponse = z.infer<typeof mobileSyncPullResponseSchema>;
export type MobileSyncPushOperation = z.infer<typeof mobileSyncPushOperationSchema>;
export type MobileSyncPushRequest = z.infer<typeof mobileSyncPushRequestSchema>;
