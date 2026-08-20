import { z } from "zod";

import {
  accountTypes,
  assistantSpeechVoices,
  currencies,
  debtStatuses,
  debtTypes,
  bugReportCategories,
  bugReportFrequencies,
  bugReportPageContexts,
  bugReportStatuses,
  customerReviewModerationStatuses,
  financialGoalStatuses,
  interestFrequencies,
  subscriptionBillingCycles,
  subscriptionStatuses,
  transactionKinds,
} from "./types";

const bugReportDetailSchema = z.string().trim().min(5).max(2_000);

export const bugReportDraftSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    category: z.enum(bugReportCategories),
    actualBehavior: bugReportDetailSchema,
    expectedBehavior: bugReportDetailSchema,
    stepsToReproduce: bugReportDetailSchema,
    frequency: z.enum(bugReportFrequencies),
  })
  .strict();

export type BugReportDraftInput = z.infer<typeof bugReportDraftSchema>;

export const bugReportDiagnosticsSchema = z
  .object({
    route: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^\/[A-Za-z0-9/_-]*$/, "Include only the page path without a query or fragment."),
    releaseVersion: z.string().trim().min(1).max(40),
    viewportWidth: z.number().int().min(240).max(10_000),
    viewportHeight: z.number().int().min(240).max(10_000),
    displayMode: z.enum(["browser", "standalone"]),
    platform: z.enum(["android", "ios", "desktop", "other"]),
  })
  .strict();

export const bugReportCreateSchema = bugReportDraftSchema
  .extend({
    clientRequestId: z.string().uuid(),
    pageContext: z.enum(bugReportPageContexts),
    diagnostics: bugReportDiagnosticsSchema,
  })
  .strict();

export type BugReportCreateInput = z.infer<typeof bugReportCreateSchema>;

export const bugReportStatusUpdateSchema = z.object({ status: z.enum(bugReportStatuses) }).strict();

export type BugReportStatusUpdate = z.infer<typeof bugReportStatusUpdateSchema>;

export const customerReviewInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(50),
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(20).max(600),
    publishConsent: z.literal(true),
  })
  .strict();

export type CustomerReviewInput = z.infer<typeof customerReviewInputSchema>;

export const customerReviewModerationUpdateSchema = z
  .object({ status: z.enum(customerReviewModerationStatuses).exclude(["pending"]) })
  .strict();

export type CustomerReviewModerationUpdate = z.infer<typeof customerReviewModerationUpdateSchema>;

export const customerReviewLineupUpdateSchema = z
  .object({ reviewIds: z.array(z.string().uuid()).max(6) })
  .strict()
  .refine((value) => new Set(value.reviewIds).size === value.reviewIds.length, {
    path: ["reviewIds"],
    message: "Choose each review only once.",
  });

export type CustomerReviewLineupUpdate = z.infer<typeof customerReviewLineupUpdateSchema>;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a real calendar date.");

export const resourceIdSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9:_-]+$/, "Use a valid resource identifier.");

export const billingCheckoutRequestSchema = z
  .object({ interval: z.enum(["month", "year"]) })
  .strict();

export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;

export const sponsoredSeatEmailRequestSchema = z
  .object({ email: z.string().trim().email().max(320) })
  .strict();

export type SponsoredSeatEmailRequest = z.infer<typeof sponsoredSeatEmailRequestSchema>;

export const sponsoredSeatSlotSchema = z.coerce.number().int().min(1).max(5);

export const accountDeletionRequestSchema = z
  .object({
    confirmation: z.literal("DELETE"),
    password: z.string().min(1).max(1_024),
  })
  .strict();

export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;

export const assistantThreadIdSchema = z.string().uuid();

export const categoryListQuerySchema = z
  .object({
    includeArchived: z.enum(["true", "false"]).optional().default("false"),
  })
  .strict()
  .transform((value) => ({ includeArchived: value.includeArchived === "true" }));

export const dashboardQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export const cashflowTrendQuerySchema = z
  .object({
    view: z.enum(["weekly", "monthly", "sixMonth"]),
    anchorDate: isoDateSchema,
  })
  .strict();

export type CashflowTrendQuery = z.infer<typeof cashflowTrendQuerySchema>;

export const accountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(accountTypes),
  })
  .strict();

export type AccountInput = z.infer<typeof accountInputSchema>;

export const accountUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(accountTypes).optional(),
  })
  .strict();

export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

export const interestUpdateSchema = z
  .object({
    enabled: z.boolean(),
    annualRateBasisPoints: z.number().int().min(0).max(10_000),
    frequency: z.enum(interestFrequencies),
    payDay: z.number().int().min(1).max(31).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled) return;
    if (value.annualRateBasisPoints === 0) {
      context.addIssue({
        code: "custom",
        path: ["annualRateBasisPoints"],
        message: "Enter a rate above 0%.",
      });
    }
    if (value.frequency === "daily" && value.payDay !== null) {
      context.addIssue({
        code: "custom",
        path: ["payDay"],
        message: "Daily interest has no pay day.",
      });
    }
    if ((value.frequency === "monthly" || value.frequency === "yearly") && value.payDay === null) {
      context.addIssue({
        code: "custom",
        path: ["payDay"],
        message: "Choose a pay day for this frequency.",
      });
    }
  });

export type AccountInterestUpdate = z.infer<typeof interestUpdateSchema>;

/**
 * An account edit may change its type and automatic-interest settings together.
 * Keeping them in one payload prevents a savings conversion from racing a
 * follow-up interest update.
 */
export const accountUpdateWithInterestSchema = accountUpdateSchema
  .extend({ interest: interestUpdateSchema.optional() })
  .strict();

export type AccountUpdateWithInterest = z.infer<typeof accountUpdateWithInterestSchema>;

// Backwards-compatible type export for integrations compiled against the previous API.
export type AccountBalanceUpdate = { balanceMinor: number | null; balanceAsOf: string | null };

export const assistantMessageInputSchema = z
  .object({
    message: z.string().trim().min(1).max(2_000),
    clientRequestId: z.string().uuid(),
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

export const receiptConsentUpdateSchema = z.object({ consented: z.literal(true) }).strict();

export type ReceiptConsentUpdate = z.infer<typeof receiptConsentUpdateSchema>;

export const receiptPreferencesResponseSchema = z
  .object({
    enabled: z.boolean(),
    consentedAt: z.iso.datetime().nullable(),
    consentVersion: z.number().int().min(0),
    visionModel: z.string().min(1).max(200),
  })
  .strict();

export const receiptDraftSchema = z
  .object({
    merchant: z.string().trim().min(1).max(240),
    date: isoDateSchema,
    amountMinor: z.number().int(),
    currency: z.literal("PHP"),
    kind: z.enum(transactionKinds),
    categoryName: z.string().trim().min(1).max(80).optional(),
    items: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(160),
            amountMinor: z.number().int().positive(),
            categoryName: z.string().trim().min(1).max(80).optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    rawText: z.string().max(6_000),
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.amountMinor === 0) {
      context.addIssue({
        code: "custom",
        path: ["amountMinor"],
        message: "Amount cannot be zero.",
      });
    }
  });

export const transactionVoiceDraftSchema = z
  .object({
    transcript: z.string().trim().min(1).max(20_000),
    description: z.string().trim().min(1).max(240),
    date: isoDateSchema,
    amountMinor: z.number().int().positive(),
    currency: z.literal("PHP"),
    kind: z.enum(transactionKinds),
    categoryName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

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

export const accountTypeSchema = z.enum(accountTypes);

const transactionBaseSchema = z
  .object({
    date: isoDateSchema,
    description: z.string().trim().min(1).max(240),
    amountMinor: z
      .number()
      .int()
      .safe()
      .refine((value) => value > 0, "Amount must be greater than zero."),
    currency: z.enum(currencies),
    categoryId: resourceIdSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const transferInputSchema = transactionBaseSchema
  .extend({
    kind: z.literal("transfer"),
    description: z.string().trim().max(240).optional(),
    transferFeeMinor: z.number().int().safe().min(0).optional(),
    fromAccountId: resourceIdSchema,
    toAccountId: resourceIdSchema,
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    path: ["toAccountId"],
    message: "Choose different accounts for a transfer.",
  })
  .refine((value) => (value.transferFeeMinor ?? 0) < value.amountMinor, {
    path: ["transferFeeMinor"],
    message: "The transfer fee must be less than the amount.",
  });

export type TransferInput = z.infer<typeof transferInputSchema>;

export const transactionInputSchema = z.discriminatedUnion("kind", [
  transactionBaseSchema.extend({ kind: z.literal("income"), accountId: resourceIdSchema }),
  transactionBaseSchema.extend({ kind: z.literal("expense"), accountId: resourceIdSchema }),
  transferInputSchema,
]);

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionUpdateSchema = z
  .object({
    date: isoDateSchema.optional(),
    description: z.string().trim().max(240).optional(),
    amountMinor: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0, "Amount cannot be zero.")
      .optional(),
    currency: z.enum(currencies).optional(),
    kind: z.enum(transactionKinds).optional(),
    categoryId: resourceIdSchema.optional(),
    accountId: resourceIdSchema.optional(),
    fromAccountId: resourceIdSchema.optional(),
    toAccountId: resourceIdSchema.optional(),
    transferFeeMinor: z.number().int().safe().min(0).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;

const transactionFilterShape = {
  search: z.string().trim().max(120).optional(),
  accountId: resourceIdSchema.optional(),
  categoryId: resourceIdSchema.optional(),
  kind: z.enum(transactionKinds).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sortBy: z.enum(["date", "description", "amount"]).default("date"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
} as const;

export const transactionListQuerySchema = z
  .object({
    ...transactionFilterShape,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const transactionExportQuerySchema = z
  .object(transactionFilterShape)
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export type TransactionExportQuery = z.infer<typeof transactionExportQuerySchema>;

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(transactionKinds),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color."),
  })
  .strict();

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const monthStartSchema = isoDateSchema.refine(
  (value) => value.endsWith("-01"),
  "Use the first day of the month.",
);

export const transactionCalendarQuerySchema = z.object({ month: monthStartSchema }).strict();

export type TransactionCalendarQuery = z.infer<typeof transactionCalendarQuerySchema>;

const eventTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");

function validateEventTimes(
  value: { startTime?: string | null; endTime?: string | null },
  context: z.RefinementCtx,
) {
  if (value.endTime && !value.startTime) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "Add a start time before the end time.",
    });
  } else if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "The end time must be later than the start time.",
    });
  }
}

export const calendarEventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Enter an event title.").max(120),
    date: isoDateSchema,
    startTime: eventTimeSchema.nullable().optional(),
    endTime: eventTimeSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine(validateEventTimes);

export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

export const calendarEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Enter an event title.").max(120).optional(),
    date: isoDateSchema.optional(),
    startTime: eventTimeSchema.nullable().optional(),
    endTime: eventTimeSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;

export const calendarEventQuerySchema = z.object({ month: monthStartSchema }).strict();

export type CalendarEventQuery = z.infer<typeof calendarEventQuerySchema>;

export const budgetQuerySchema = z.object({ month: monthStartSchema }).strict();

export const budgetUpsertSchema = z
  .object({
    month: monthStartSchema,
    items: z
      .array(
        z
          .object({
            categoryId: resourceIdSchema,
            limitMinor: z.number().int().safe().min(0).max(1_000_000_000_00),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.categoryId)).size === items.length,
        "Budget categories must be unique.",
      ),
  })
  .strict();

export type BudgetUpsert = z.infer<typeof budgetUpsertSchema>;

const financialGoalBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetAmountMinor: z.number().int().safe().min(1).max(900_000_000_000_000),
    currentAmountMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    targetDate: isoDateSchema,
    status: z.enum(financialGoalStatuses).default("active"),
  })
  .strict()
  .refine((value) => value.currentAmountMinor <= value.targetAmountMinor, {
    message: "Current savings cannot exceed the target amount.",
    path: ["currentAmountMinor"],
  });

export const financialGoalInputSchema = financialGoalBaseSchema;
export type FinancialGoalInput = z.infer<typeof financialGoalInputSchema>;

export const financialGoalUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    targetAmountMinor: z.number().int().safe().min(1).max(900_000_000_000_000).optional(),
    currentAmountMinor: z.number().int().safe().min(0).max(900_000_000_000_000).optional(),
    targetDate: isoDateSchema.optional(),
    status: z.enum(financialGoalStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");
export type FinancialGoalUpdate = z.infer<typeof financialGoalUpdateSchema>;

export const debtInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(debtTypes),
    balanceMinor: z.number().int().safe().min(1).max(900_000_000_000_000),
    aprBasisPoints: z.number().int().min(0).max(10_000),
    minimumPaymentMinor: z.number().int().safe().min(0).max(900_000_000_000_000),
    balanceAsOf: isoDateSchema,
    status: z.enum(debtStatuses).default("active"),
  })
  .strict();
export type DebtInput = z.infer<typeof debtInputSchema>;

export const debtUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: z.enum(debtTypes).optional(),
    balanceMinor: z.number().int().safe().min(0).max(900_000_000_000_000).optional(),
    aprBasisPoints: z.number().int().min(0).max(10_000).optional(),
    minimumPaymentMinor: z.number().int().safe().min(0).max(900_000_000_000_000).optional(),
    balanceAsOf: isoDateSchema.optional(),
    status: z.enum(debtStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");
export type DebtUpdate = z.infer<typeof debtUpdateSchema>;

export const subscriptionQuerySchema = z.object({ month: monthStartSchema }).strict();

export const subscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    amountMinor: z.number().int().safe().min(1).max(1_000_000_000_00),
    billingCycle: z.enum(subscriptionBillingCycles),
    nextBillingDate: isoDateSchema,
    categoryId: resourceIdSchema,
    accountId: resourceIdSchema,
  })
  .strict();

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const subscriptionUpdateSchema = subscriptionInputSchema;

export type SubscriptionUpdate = z.infer<typeof subscriptionUpdateSchema>;

export const subscriptionStatusUpdateSchema = z
  .object({
    status: z.enum(subscriptionStatuses),
  })
  .strict();

export type SubscriptionStatusUpdate = z.infer<typeof subscriptionStatusUpdateSchema>;

const importColumnSchema = z.string().trim().min(1);

export const importMappingSchema = z
  .object({
    date: importColumnSchema.optional(),
    description: importColumnSchema,
    amount: importColumnSchema.optional(),
    debit: importColumnSchema.optional(),
    credit: importColumnSchema.optional(),
    category: importColumnSchema.optional(),
    kind: importColumnSchema.optional(),
    currency: importColumnSchema.optional(),
  })
  .strict()
  .superRefine((mapping, context) => {
    const usesAmount = Boolean(mapping.amount);
    const usesDebit = Boolean(mapping.debit);
    const usesCredit = Boolean(mapping.credit);
    const hasValidAmountStrategy =
      (usesAmount && !usesDebit && !usesCredit) || (!usesAmount && usesDebit && usesCredit);
    if (!hasValidAmountStrategy) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Choose one Amount column or both Debit and Credit columns.",
      });
    }

    const columns = Object.values(mapping)
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLocaleLowerCase("en"));
    if (new Set(columns).size !== columns.length) {
      context.addIssue({
        code: "custom",
        message: "Each mapped field must use a different source column.",
      });
    }
  });

export const importPreviewRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    csvText: z.string().min(1).max(1_100_000),
    headerRowNumber: z.number().int().min(1).max(10_000).optional(),
    mapping: importMappingSchema,
    fallbackDate: isoDateSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const hasMappedDate = Boolean(input.mapping.date);
    const hasFallbackDate = Boolean(input.fallbackDate);
    if (hasMappedDate === hasFallbackDate) {
      context.addIssue({
        code: "custom",
        path: ["fallbackDate"],
        message: "Choose a Date column or enter one date for every row.",
      });
    }
  });

export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;

export const importCommitSchema = z
  .object({
    token: z.string().uuid(),
    categoryOverrides: z
      .array(
        z
          .object({
            rowNumber: z.number().int().min(1),
            categoryId: resourceIdSchema,
          })
          .strict(),
      )
      .max(500)
      .default([]),
    kindOverrides: z
      .array(
        z
          .object({
            rowNumber: z.number().int().min(1),
            kind: z.enum(transactionKinds),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict()
  .superRefine((input, context) => {
    const categoryRows = input.categoryOverrides.map((override) => override.rowNumber);
    if (new Set(categoryRows).size !== categoryRows.length) {
      context.addIssue({
        code: "custom",
        path: ["categoryOverrides"],
        message: "Each import row can have only one category override.",
      });
    }
    const kindRows = input.kindOverrides.map((override) => override.rowNumber);
    if (new Set(kindRows).size !== kindRows.length) {
      context.addIssue({
        code: "custom",
        path: ["kindOverrides"],
        message: "Each import row can have only one transaction type override.",
      });
    }
  });

export const importPreviewRowSchema = z
  .object({
    rowNumber: z.number().int().min(1),
    status: z.enum(["ready", "invalid", "duplicate"]),
    date: isoDateSchema.optional(),
    description: z.string().optional(),
    amountMinor: z.number().int().optional(),
    kind: z.enum(transactionKinds).optional(),
    categoryId: resourceIdSchema.optional(),
    categoryName: z.string().optional(),
    categoryIsUncategorized: z.boolean().optional(),
    errors: z.array(z.string().max(240)).max(20),
  })
  .strict();

export const importPreviewResponseSchema = z
  .object({
    token: z.string().uuid(),
    expiresAt: z.iso.datetime(),
    fileName: z.string().min(1).max(180),
    rowCount: z.number().int().min(0).max(10_000),
    acceptedCount: z.number().int().min(0).max(10_000),
    rejectedCount: z.number().int().min(0).max(10_000),
    duplicateCount: z.number().int().min(0).max(10_000),
    rows: z.array(importPreviewRowSchema).max(10_000),
  })
  .strict();

export const importCommitResultSchema = z
  .object({
    importId: z.string().uuid(),
    importedCount: z.number().int().min(0).max(10_000),
    rejectedCount: z.number().int().min(0).max(10_000),
  })
  .strict();

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
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const assistantThreadSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
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
    transcriptionModel: z.literal("@cf/openai/whisper-large-v3-turbo"),
    ttsModel: z.literal("s2.1-pro-free"),
  })
  .strict();

export const assistantVoiceTranscriptionResponseSchema = z
  .object({
    text: z.string().max(20_000),
    durationSeconds: z.number().min(0),
    languageCode: z.string().optional(),
  })
  .strict();

// Billing, support, bug-report and account-deletion response contracts shared
// by the mobile client for the online-only surfaces (milestone 8).

export const billingUsageSchema = z
  .object({
    feature: z.enum(["assistant_question", "file_import"]),
    used: z.number().int().min(0),
    limit: z.number().int().min(0),
    periodKind: z.enum(["calendar_month", "anchored_14_day"]),
    periodStartedAt: z.iso.datetime().nullable(),
    resetsAt: z.iso.datetime().nullable(),
  })
  .strict();

export const billingResourceAllowanceSchema = z
  .object({
    resource: z.enum(["custom_category"]),
    used: z.number().int().min(0),
    limit: z.number().int().min(0).nullable(),
  })
  .strict();

export const billingSummaryResponseSchema = z
  .object({
    plan: z.enum(["free", "zoption_pro"]),
    entitlementSource: z.enum(["paypal", "platform_admin", "sponsored"]).nullable(),
    provider: z.enum(["paypal"]).nullable(),
    status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]).nullable(),
    interval: z.enum(["month", "year"]).nullable(),
    currentPeriodEndsAt: z.iso.datetime().nullable(),
    scheduledChangeAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    pendingCheckout: z
      .object({
        provider: z.enum(["paypal"]),
        interval: z.enum(["month", "year"]),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    canCheckout: z.boolean(),
    canManageBilling: z.boolean(),
    canManageSponsoredSeats: z.boolean(),
    nonTerminalSubscriptionCount: z.number().int().min(0),
    usages: z.array(billingUsageSchema).max(10),
    allowances: z.array(billingResourceAllowanceSchema).max(10),
  })
  .strict();

export const billingCheckoutResponseSchema = z.object({ approvalUrl: z.string().url() }).strict();

export const billingCancelResponseSchema = z
  .object({ cancellationRequested: z.literal(true) })
  .strict();

export const billingReconciliationResponseSchema = z
  .object({
    outcome: z.enum(["confirmed", "pending", "review_required", "closed", "none"]),
    summary: billingSummaryResponseSchema,
  })
  .strict();

export const supportChatResponseSchema = z
  .object({
    message: z.string().max(20_000),
    bugReportDraft: bugReportDraftSchema.optional(),
  })
  .strict();

export const bugReportResponseSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    category: z.enum(bugReportCategories),
    actualBehavior: z.string().min(1).max(2_000),
    expectedBehavior: z.string().min(1).max(2_000),
    stepsToReproduce: z.string().min(1).max(2_000),
    frequency: z.enum(bugReportFrequencies),
    pageContext: z.enum(bugReportPageContexts),
    diagnostics: bugReportDiagnosticsSchema,
    status: z.enum(bugReportStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const accountDeletionResponseSchema = z
  .object({ status: z.enum(["deleted", "cleanup_pending"]) })
  .strict();
