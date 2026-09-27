// AI assistant preferences, memory, voice, tools, and response contracts.

import { z } from "zod";

import { assistantSpeechVoices, transactionKinds } from "../types";
import { isoDateSchema } from "./common";

export const assistantThreadIdSchema = z.string().uuid();

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
  .refine((value) => Number(value) <= 9_000_000_000_000, "The amount is too large.");

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

// Assistant (online-only, read-only, server-grounded) response contracts shared
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
