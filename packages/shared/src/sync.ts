import { z } from "zod";

import {
  accountInputSchema,
  accountUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  debtInputSchema,
  debtUpdateSchema,
  isoDateSchema,
  monthStartSchema,
  resourceIdSchema,
  subscriptionInputSchema,
  transferInputSchema,
  transactionInputSchema,
  transactionUpdateSchema,
} from "./schemas";
import {
  accountTypes,
  categoryOrigins,
  categoryRequiredPlans,
  currencies,
  debtStatuses,
  debtTypes,
  financialGoalStatuses,
  interestFrequencies,
  subscriptionBillingCycles,
  subscriptionStatuses,
  transactionKinds,
} from "./types";

export const MOBILE_SYNC_PROTOCOL_VERSION = 1 as const;
export const mobileSyncEntityTypes = ["account", "category", "transaction", "transfer", "budget", "goal", "debt", "subscription"] as const;
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

export const mobileSyncSnapshotCursorSchema = z
  .string()
  .regex(/^s1\.[0-9a-z]+$/)
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

export const mobileSyncTransferSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    fromTransactionId: resourceIdSchema,
    toTransactionId: resourceIdSchema,
    fromAccountId: resourceIdSchema,
    toAccountId: resourceIdSchema,
    categoryId: resourceIdSchema,
    date: isoDateSchema,
    description: z.string().max(240),
    amountMinor: z.number().int().safe().positive(),
    currency: z.enum(currencies),
    notes: z.string().max(500).nullable(),
    transferFeeMinor: z.number().int().safe().min(0),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict()
  .refine((value) => value.fromTransactionId !== value.toTransactionId, {
    path: ["toTransactionId"],
    message: "Transfer legs must use different IDs.",
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    path: ["toAccountId"],
    message: "Transfers require different accounts.",
  })
  .refine((value) => value.transferFeeMinor < value.amountMinor, {
    path: ["transferFeeMinor"],
    message: "The transfer fee must be less than the amount.",
  });

export const mobileSyncBudgetSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    categoryId: resourceIdSchema,
    month: monthStartSchema,
    limitMinor: z.number().int().safe().min(0).max(1_000_000_000_00),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncGoalSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(80),
    targetAmountMinor: z.number().int().safe().min(1).max(900_000_000_000_000),
    currentAmountMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    targetDate: isoDateSchema,
    status: z.enum(financialGoalStatuses),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncDebtSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(80),
    type: z.enum(debtTypes),
    balanceMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    aprBasisPoints: z.number().int().min(0).max(10_000),
    minimumPaymentMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    balanceAsOf: isoDateSchema,
    status: z.enum(debtStatuses),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncSubscriptionSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(120),
    amountMinor: z.number().int().safe().min(1).max(1_000_000_000_00),
    currency: z.enum(currencies),
    billingCycle: z.enum(subscriptionBillingCycles),
    nextBillingDate: isoDateSchema,
    status: z.enum(subscriptionStatuses),
    categoryId: resourceIdSchema,
    accountId: resourceIdSchema.nullable(),
    revision: serverRevisionSchema,
    updatedAt: serverTimestampSchema,
  })
  .strict();

export const mobileSyncSnapshotSchema = z.union([
  mobileSyncAccountSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
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
            : change.entityType === "budget"
              ? mobileSyncBudgetSnapshotSchema
              : change.entityType === "goal"
                ? mobileSyncGoalSnapshotSchema
                : change.entityType === "debt"
                  ? mobileSyncDebtSnapshotSchema
                  : change.entityType === "subscription"
                    ? mobileSyncSubscriptionSnapshotSchema
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

export const mobileSyncAcknowledgeRequestSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    clientId: uuidSchema,
    cursor: mobileSyncCursorSchema,
  })
  .strict();

export const mobileSyncAcknowledgeResponseSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    acknowledgedCursor: mobileSyncCursorSchema,
    retentionFloorCursor: mobileSyncCursorSchema,
  })
  .strict();

export const mobileSyncSnapshotRequestSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    clientId: uuidSchema,
    snapshotCursor: mobileSyncSnapshotCursorSchema.nullable().default(null),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict()
  .refine((value) => value.snapshotCursor !== null || value.offset === 0, {
    path: ["offset"],
    message: "A new snapshot starts at offset zero.",
  });

export const mobileSyncSnapshotResponseSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    snapshotCursor: mobileSyncSnapshotCursorSchema,
    changes: z.array(mobileSyncChangeSchema).max(200),
    nextOffset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    resumeCursor: mobileSyncCursorSchema,
  })
  .strict();

const operationIdentityShape = {
  operationId: uuidSchema,
  idempotencyKey: uuidSchema,
  entityId: resourceIdSchema,
  dependencyIds: z.array(uuidSchema).max(20).default([]),
} as const;

const createOperation = <
  TEntity extends
    | "account"
    | "category"
    | "transaction"
    | "transfer"
    | "budget"
    | "goal"
    | "debt"
    | "subscription",
  T extends z.ZodType,
>(
  entityType: TEntity,
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

const updateOperation = <
  TEntity extends
    | "account"
    | "category"
    | "transaction"
    | "transfer"
    | "budget"
    | "goal"
    | "debt"
    | "subscription",
  T extends z.ZodType,
>(
  entityType: TEntity,
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

const deleteOperation = <
  TEntity extends
    | "account"
    | "category"
    | "transaction"
    | "transfer"
    | "goal"
    | "debt"
    | "subscription",
>(
  entityType: TEntity,
) =>
  z
    .object({
      ...operationIdentityShape,
      entityType: z.literal(entityType),
      operationType: z.literal("delete"),
      baseRevision: serverRevisionSchema,
      payload: z.object({}).strict(),
    })
    .strict();

const mobileSyncBudgetInputSchema = z
  .object({
    categoryId: resourceIdSchema,
    month: monthStartSchema,
    limitMinor: z.number().int().safe().min(0).max(1_000_000_000_00),
  })
  .strict();

const mobileSyncBudgetUpdateSchema = z
  .object({
    limitMinor: z.number().int().safe().min(0).max(1_000_000_000_00),
  })
  .strict();

const mobileSyncGoalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetAmountMinor: z.number().int().safe().min(1).max(900_000_000_000_000),
    currentAmountMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    targetDate: isoDateSchema,
    status: z.enum(financialGoalStatuses),
  })
  .strict()
  .refine((value) => value.currentAmountMinor <= value.targetAmountMinor, {
    message: "Current savings cannot exceed the target amount.",
    path: ["currentAmountMinor"],
  });

const mobileSyncGoalUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    targetAmountMinor: z.number().int().safe().min(1).max(900_000_000_000_000).optional(),
    currentAmountMinor: z.number().int().safe().min(0).max(900_000_000_000_000).optional(),
    targetDate: isoDateSchema.optional(),
    status: z.enum(financialGoalStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

const mobileSyncSubscriptionUpdateSchema = subscriptionInputSchema
  .extend({ status: z.enum(subscriptionStatuses).optional() })
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
    createOperation("budget", mobileSyncBudgetInputSchema),
    updateOperation("budget", mobileSyncBudgetUpdateSchema),
    createOperation("goal", mobileSyncGoalInputSchema),
    updateOperation("goal", mobileSyncGoalUpdateSchema),
    deleteOperation("goal"),
    createOperation("debt", debtInputSchema),
    updateOperation("debt", debtUpdateSchema),
    deleteOperation("debt"),
    createOperation("subscription", subscriptionInputSchema),
    updateOperation("subscription", mobileSyncSubscriptionUpdateSchema),
    deleteOperation("subscription"),
    createOperation(
      "transfer",
      z
        .object({
          fromTransactionId: uuidSchema,
          toTransactionId: uuidSchema,
          transfer: transferInputSchema,
        })
        .strict()
        .refine((value) => value.fromTransactionId !== value.toTransactionId, {
          path: ["toTransactionId"],
          message: "Transfer legs must use different IDs.",
        }),
    ),
    updateOperation("transfer", z.object({ transfer: transferInputSchema }).strict()),
    deleteOperation("transfer"),
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
    const entityKeys = request.operations.map(
      (operation) => `${operation.entityType}:${operation.entityId}`,
    );
    if (new Set(entityKeys).size !== entityKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "A batch can contain only one operation for each entity.",
      });
    }
    const positions = new Map(operationIds.map((operationId, index) => [operationId, index]));
    request.operations.forEach((operation, index) => {
      operation.dependencyIds.forEach((dependencyId, dependencyIndex) => {
        const dependencyPosition = positions.get(dependencyId);
        if (dependencyPosition === undefined || dependencyPosition >= index) {
          context.addIssue({
            code: "custom",
            path: ["operations", index, "dependencyIds", dependencyIndex],
            message: "Dependencies must reference an earlier operation in the same batch.",
          });
        }
      });
    });
  });

const mobileSyncPushResultIdentitySchema = z.object({
  operationId: uuidSchema,
  entityType: z.enum(mobileSyncEntityTypes),
  entityId: resourceIdSchema,
});

export const mobileSyncPushResultSchema = z
  .union([
    mobileSyncPushResultIdentitySchema
      .extend({
        status: z.literal("acknowledged"),
        revision: serverRevisionSchema,
      })
      .strict(),
    mobileSyncPushResultIdentitySchema
      .extend({
        status: z.literal("conflict"),
        code: z.enum(["stale_revision", "entity_exists", "entity_missing"]),
        serverRevision: serverRevisionSchema.nullable(),
        serverUpdatedAt: serverTimestampSchema.nullable(),
        serverPayload: mobileSyncSnapshotSchema.nullable(),
      })
      .strict(),
    mobileSyncPushResultIdentitySchema
      .extend({
        status: z.literal("rejected"),
        code: z.enum([
          "invalid_category",
          "invalid_account",
          "plan_limit",
          "dependency_failed",
          "invalid_operation",
          "unsupported_operation",
        ]),
        message: z.string().min(1).max(240),
      })
      .strict(),
  ])
  .superRefine((result, context) => {
    if (result.status !== "conflict" || !result.serverPayload) return;
    // A budget "entity_exists" conflict returns the existing budget's snapshot, whose
    // id legitimately differs from the client-generated id of the rejected create.
    const foreignIdAllowed = result.code === "entity_exists" && result.entityType === "budget";
    if (
      (!foreignIdAllowed && result.serverPayload.id !== result.entityId) ||
      result.serverPayload.revision !== result.serverRevision ||
      result.serverPayload.updatedAt !== result.serverUpdatedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["serverPayload"],
        message: "Conflict snapshot metadata must match the result.",
      });
    }
    const expectedSchema =
      result.entityType === "account"
        ? mobileSyncAccountSnapshotSchema
        : result.entityType === "category"
          ? mobileSyncCategorySnapshotSchema
          : result.entityType === "transaction"
            ? mobileSyncTransactionSnapshotSchema
            : result.entityType === "budget"
              ? mobileSyncBudgetSnapshotSchema
              : result.entityType === "goal"
                ? mobileSyncGoalSnapshotSchema
                : result.entityType === "debt"
                  ? mobileSyncDebtSnapshotSchema
                  : result.entityType === "subscription"
                    ? mobileSyncSubscriptionSnapshotSchema
                    : mobileSyncTransferSnapshotSchema;
    if (!expectedSchema.safeParse(result.serverPayload).success) {
      context.addIssue({
        code: "custom",
        path: ["serverPayload"],
        message: "Conflict snapshot does not match its entity type.",
      });
    }
  });

export const mobileSyncPushResponseSchema = z
  .object({
    protocolVersion: z.literal(MOBILE_SYNC_PROTOCOL_VERSION),
    results: z.array(mobileSyncPushResultSchema).min(1).max(50),
  })
  .strict();

export type MobileSyncChange = z.infer<typeof mobileSyncChangeSchema>;
export type MobileSyncAcknowledgeRequest = z.infer<typeof mobileSyncAcknowledgeRequestSchema>;
export type MobileSyncAcknowledgeResponse = z.infer<typeof mobileSyncAcknowledgeResponseSchema>;
export type MobileSyncSnapshotRequest = z.infer<typeof mobileSyncSnapshotRequestSchema>;
export type MobileSyncSnapshotResponse = z.infer<typeof mobileSyncSnapshotResponseSchema>;
export type MobileSyncPullRequest = z.infer<typeof mobileSyncPullRequestSchema>;
export type MobileSyncPullResponse = z.infer<typeof mobileSyncPullResponseSchema>;
export type MobileSyncPushOperation = z.infer<typeof mobileSyncPushOperationSchema>;
export type MobileSyncPushRequest = z.infer<typeof mobileSyncPushRequestSchema>;
export type MobileSyncPushResult = z.infer<typeof mobileSyncPushResultSchema>;
export type MobileSyncPushResponse = z.infer<typeof mobileSyncPushResponseSchema>;
