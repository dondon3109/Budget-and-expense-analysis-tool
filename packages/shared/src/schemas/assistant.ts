// AI assistant preferences, memory, voice, tools, and response contracts.

import { z } from "zod";

import { GOAL_AND_DEBT_MAX_MINOR } from "../limits";
import {
  accountTypes,
  assistantSpeechVoices,
  currencies,
  debtTypes,
  subscriptionBillingCycles,
  transactionKinds,
} from "../types";
import { isoDateSchema, resourceIdSchema } from "./common";
import { accountInputSchema, accountUpdateSchema } from "./ledger";
import {
  debtInputSchema,
  debtUpdateSchema,
  financialGoalInputSchema,
  financialGoalUpdateSchema,
} from "./planning";
import {
  subscriptionInputSchema,
  subscriptionStatusUpdateSchema,
  subscriptionUpdateSchema,
} from "./subscriptions";

export const assistantThreadIdSchema = z.string().uuid();
export const assistantMessageIdSchema = z.string().uuid();

export const assistantMessageInputSchema = z
  .object({
    message: z.string().trim().min(1).max(2_000),
    clientRequestId: z.string().uuid(),
    kind: z.enum(["text", "voice"]).optional(),
  })
  .strict();

export type AssistantMessageInput = z.infer<typeof assistantMessageInputSchema>;

function hasAssistantIdentityControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!;
    return (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x200b && codePoint <= 0x200f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      codePoint === 0x2060 ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    );
  });
}

export function normalizeAssistantIdentityName(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export const assistantIdentityNameSchema = z
  .string()
  .max(240, "Keep names to 80 characters or fewer.")
  .refine(
    (value) => !hasAssistantIdentityControlCharacter(value),
    "Names cannot contain control characters or line breaks.",
  )
  .transform(normalizeAssistantIdentityName)
  .pipe(z.string().min(1, "Enter a name.").max(80, "Keep names to 80 characters or fewer."));

export const assistantPreferenceUpdateSchema = z.union([
  z
    .object({
      consented: z.literal(true),
    })
    .strict(),
  z
    .object({
      assistantName: assistantIdentityNameSchema,
      userPreferredName: assistantIdentityNameSchema,
    })
    .strict(),
  z
    .object({
      responseDetail: z.enum(["concise", "standard"]),
      coachingStyle: z.enum(["gentle", "direct"]),
    })
    .strict(),
]);

export type AssistantPreferenceUpdate = z.infer<typeof assistantPreferenceUpdateSchema>;

export const assistantVoiceConsentUpdateSchema = z.object({ consented: z.literal(true) }).strict();

export const assistantSpeechVoiceSchema = z.enum(assistantSpeechVoices);

export const assistantVoiceSpeechInputSchema = z
  .object({
    messageId: z.string().uuid(),
    voice: assistantSpeechVoiceSchema.default("default"),
  })
  .strict();

export const assistantVoicePreviewInputSchema = z
  .object({ voice: assistantSpeechVoiceSchema })
  .strict();

export const assistantMemoryPreferencesUpdateSchema = z
  .object({
    debtStrategy: z.enum(["avalanche", "snowball"]).nullable(),
  })
  .strict();

export const assistantMemoryIdSchema = z.string().uuid();

export const assistantMemoryUpdateSchema = z
  .object({
    value: z.string().trim().min(1).max(240),
  })
  .strict();

export type AssistantMemoryUpdate = z.infer<typeof assistantMemoryUpdateSchema>;

export const assistantThreadListQuerySchema = z
  .object({
    cursor: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(25).default(20),
  })
  .strict();

export type AssistantThreadListQuery = z.infer<typeof assistantThreadListQuerySchema>;

export const assistantMessageListQuerySchema = z
  .object({
    cursor: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();

export type AssistantMessageListQuery = z.infer<typeof assistantMessageListQuerySchema>;

export const assistantAccountBalancesToolSchema = z
  .object({
    accountName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const assistantPeriodSummaryToolSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    accountName: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const assistantBudgetStatusToolSchema = z
  .object({
    month: isoDateSchema.refine(
      (value) => value.endsWith("-01"),
      "Use the first day of the month.",
    ),
  })
  .strict();

export const assistantTransactionToolSchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    kind: z.enum(transactionKinds).optional(),
    categoryName: z.string().trim().min(1).max(80).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    page: z.number().int().min(1).max(10).default(1),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const assistantCategoryToolSchema = z
  .object({ kind: z.enum(transactionKinds).optional() })
  .strict();

const assistantDateRangeShape = {
  from: isoDateSchema,
  to: isoDateSchema,
} as const;

export const assistantSpendingByCategoryToolSchema = z
  .object({
    ...assistantDateRangeShape,
    categoryName: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const assistantBudgetVsActualToolSchema = z
  .object(assistantDateRangeShape)
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const assistantRecurringChargesToolSchema = z
  .object({
    through: isoDateSchema,
  })
  .strict();

export const assistantSpendingAnomaliesToolSchema = z
  .object(assistantDateRangeShape)
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const decimalMoneyStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Use a positive amount with no more than two decimals.")
  // Assistant tools take goal and debt amounts in major units, so the cap is the minor-unit cap / 100.
  .refine((value) => Number(value) <= GOAL_AND_DEBT_MAX_MINOR / 100, "The amount is too large.");

const assistantDebtProjectionItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    balance: decimalMoneyStringSchema,
    aprPercent: z.number().min(0).max(100),
    minimumPayment: decimalMoneyStringSchema,
  })
  .strict();

export const assistantDebtPayoffToolSchema = z
  .object({
    strategy: z.enum(["avalanche", "snowball"]),
    extraPayment: decimalMoneyStringSchema.optional(),
    debtNames: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    debts: z.array(assistantDebtProjectionItemSchema).min(1).max(20).optional(),
    startDate: isoDateSchema,
  })
  .strict()
  .refine((value) => Boolean(value.debts?.length || value.debtNames?.length), {
    message: "Choose saved debts or provide a hypothetical debt list.",
    path: ["debts"],
  });

export const assistantSavingsGoalToolSchema = z
  .object({
    goalName: z.string().trim().min(1).max(80).optional(),
    targetAmount: decimalMoneyStringSchema.optional(),
    targetDate: isoDateSchema.optional(),
    currentSaved: decimalMoneyStringSchema.optional(),
    currentDate: isoDateSchema,
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.goalName) ||
      Boolean(value.targetAmount && value.targetDate && value.currentSaved !== undefined),
    {
      message: "Choose a saved goal or provide target amount, target date, and current savings.",
      path: ["goalName"],
    },
  );

const assistantEntryKindSchema = z.enum(["income", "expense"]);

export const assistantTransactionSuggestionToolSchema = z
  .object({
    through: isoDateSchema,
    place: z.string().trim().min(1).max(120).optional(),
    kind: assistantEntryKindSchema.default("expense"),
  })
  .strict();

/**
 * The assistant prepares a draft, never a saved row. The amount is either stated outright or
 * derived from what the account holds after the transaction, measured against the balance
 * before it. Without a balance before, the draft asks the user to confirm the recorded one.
 */
export const assistantTransactionDraftToolSchema = z
  .object({
    kind: assistantEntryKindSchema,
    description: z.string().trim().min(1).max(240),
    categoryName: z.string().trim().min(1).max(80),
    accountName: z.string().trim().min(1).max(120),
    date: isoDateSchema,
    amount: decimalMoneyStringSchema.optional(),
    balanceAfter: decimalMoneyStringSchema.optional(),
    balanceBefore: decimalMoneyStringSchema.optional(),
    replacesPreviousDraft: z.boolean().optional(),
    currentDate: isoDateSchema,
  })
  .strict()
  .refine((value) => (value.amount === undefined) !== (value.balanceAfter === undefined), {
    message: "Give either the amount or the balance left after the transaction.",
    path: ["amount"],
  })
  .refine((value) => value.balanceBefore === undefined || value.balanceAfter !== undefined, {
    message: "A starting balance needs the balance left after the transaction.",
    path: ["balanceBefore"],
  });

/**
 * A transaction the assistant prepared in chat. Nothing is written until the user confirms it,
 * and the confirm route saves it at most once: `saving` claims it, `saved` records the result.
 */
export const assistantTransactionDraftSchema = z
  .object({
    status: z.enum(["pending", "saving", "saved"]),
    kind: assistantEntryKindSchema,
    date: isoDateSchema,
    description: z.string().trim().min(1).max(240),
    amountMinor: z.number().int().safe().positive(),
    currency: z.enum(currencies),
    categoryId: resourceIdSchema,
    categoryName: z.string().min(1).max(120),
    accountId: resourceIdSchema,
    accountName: z.string().min(1).max(120),
    transactionId: resourceIdSchema.optional(),
    claimedAt: z.iso.datetime().optional(),
    /** The earlier reply whose draft this one corrects; that draft can no longer be saved. */
    replacesMessageId: z.string().uuid().optional(),
  })
  .strict();

export type AssistantTransactionDraft = z.infer<typeof assistantTransactionDraftSchema>;

/**
 * What the model supplies to propose a change. Amounts are exact decimal strings in major
 * units, and `apr` is a percentage ("24.5"); the server resolves names to records and builds
 * the stored proposal, so the model never handles ids or minor units.
 */
export const assistantActionToolSchema = z
  .object({
    action: z.enum([
      "create_subscription",
      "update_subscription",
      "set_subscription_status",
      "delete_subscription",
      "create_goal",
      "update_goal",
      "delete_goal",
      "create_debt",
      "update_debt",
      "delete_debt",
      "create_account",
      "update_account",
      "archive_account",
      "adjust_balance",
    ]),
    target: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    amount: decimalMoneyStringSchema.optional(),
    currentAmount: decimalMoneyStringSchema.optional(),
    date: isoDateSchema.optional(),
    billingCycle: z.enum(subscriptionBillingCycles).optional(),
    categoryName: z.string().trim().min(1).max(80).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "canceled", "paused", "completed", "paid"]).optional(),
    debtType: z.enum(debtTypes).optional(),
    apr: decimalMoneyStringSchema.optional(),
    minimumPayment: decimalMoneyStringSchema.optional(),
    accountType: z.enum(accountTypes).optional(),
    currency: z.enum(currencies).optional(),
    currentDate: isoDateSchema,
  })
  .strict();

export type AssistantActionToolInput = z.infer<typeof assistantActionToolSchema>;

/**
 * A change to a subscription, goal, debt, or account the assistant proposed in chat. Nothing is written
 * until the user confirms it: the confirm route runs the stored proposal through the same
 * repository the app's own forms use, at most once (`saving` claims it, `done` records it).
 * Updates carry only the fields to change; the card shows the server-written summary.
 */
const assistantActionBase = {
  status: z.enum(["pending", "saving", "done"]),
  summary: z.string().min(1).max(400),
  claimedAt: z.iso.datetime().optional(),
};
const assistantActionTarget = {
  targetId: resourceIdSchema,
  targetName: z.string().min(1).max(120),
};

export const assistantActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...assistantActionBase,
      kind: z.literal("create_subscription"),
      input: subscriptionInputSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("update_subscription"),
      input: subscriptionUpdateSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("set_subscription_status"),
      input: subscriptionStatusUpdateSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("delete_subscription"),
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      kind: z.literal("create_goal"),
      input: financialGoalInputSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("update_goal"),
      input: financialGoalUpdateSchema,
    })
    .strict(),
  z
    .object({ ...assistantActionBase, ...assistantActionTarget, kind: z.literal("delete_goal") })
    .strict(),
  z
    .object({ ...assistantActionBase, kind: z.literal("create_debt"), input: debtInputSchema })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("update_debt"),
      input: debtUpdateSchema,
    })
    .strict(),
  z
    .object({ ...assistantActionBase, ...assistantActionTarget, kind: z.literal("delete_debt") })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      kind: z.literal("create_account"),
      input: accountInputSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("update_account"),
      input: accountUpdateSchema,
    })
    .strict(),
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("archive_account"),
    })
    .strict(),
  // The adjustment is worked out when it is applied, from the balance the account holds then.
  z
    .object({
      ...assistantActionBase,
      ...assistantActionTarget,
      kind: z.literal("adjust_balance"),
      input: z.object({ newBalanceMinor: z.number().int().safe().min(0) }).strict(),
    })
    .strict(),
]);

export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantActionKind = AssistantAction["kind"];

// Assistant (online-only, server-grounded) response contracts shared
// by the mobile client so network payloads are validated before display.

export const assistantPreferencesResponseSchema = z
  .object({
    consentedAt: z.iso.datetime().nullable(),
    consentVersion: z.number().int().min(0),
    retentionDays: z.number().int().min(0),
    assistantName: z.string().nullable(),
    userPreferredName: z.string().nullable(),
    responseDetail: z.enum(["concise", "standard"]),
    coachingStyle: z.enum(["gentle", "direct"]),
  })
  .strict();

export const assistantMemoryPreferencesResponseSchema = z
  .object({
    debtStrategy: z.enum(["avalanche", "snowball"]).nullable(),
    responseDetail: z.enum(["concise", "standard"]),
    coachingStyle: z.enum(["gentle", "direct"]),
  })
  .strict();

export const assistantMemoryItemSchema = z
  .object({
    id: z.string().min(1).max(180),
    kind: z.enum(["preference", "fact", "summary"]),
    key: z.string().max(240),
    value: z.string().max(20_000),
    source: z.enum(["user_stated", "deterministic", "model_assisted"]),
    threadId: z.string().min(1).max(180).nullable().optional(),
    threadTitle: z.string().max(240).nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const assistantThreadSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    kind: z.enum(["text", "voice"]).default("text"),
    lastMessageAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const assistantMessageSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(200_000),
    status: z.enum(["pending", "completed", "failed"]),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const assistantThreadPageSchema = z
  .object({
    items: z.array(assistantThreadSchema).max(100),
    nextCursor: z.iso.datetime().nullable(),
  })
  .strict();

export const assistantMessagePageSchema = z
  .object({
    items: z.array(assistantMessageSchema).max(100),
    nextCursor: z.iso.datetime().nullable(),
  })
  .strict();

export const assistantTurnResultSchema = z
  .object({
    thread: assistantThreadSchema,
    userMessage: assistantMessageSchema,
    assistantMessage: assistantMessageSchema,
  })
  .strict();

export const assistantVoicePreferencesResponseSchema = z
  .object({
    enabled: z.boolean(),
    speechAvailable: z.boolean(),
    reviewRequired: z.boolean(),
    consentedAt: z.iso.datetime().nullable(),
    consentVersion: z.number().int().min(0),
    transcriptionModel: z.string().min(1),
    ttsModel: z.string().min(1),
  })
  .strict();

export const assistantVoiceTranscriptionResponseSchema = z
  .object({
    text: z.string().max(20_000),
    durationSeconds: z.number().min(0),
    languageCode: z.string().optional(),
  })
  .strict();
