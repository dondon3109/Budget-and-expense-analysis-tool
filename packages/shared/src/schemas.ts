import { z } from "zod";

import {
  accountTypes,
  currencies,
  debtStatuses,
  debtTypes,
  financialGoalStatuses,
  subscriptionBillingCycles,
  subscriptionStatuses,
  transactionKinds,
} from "./types";

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

export const accountUpdateSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

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

export const transactionInputSchema = z.discriminatedUnion("kind", [
  transactionBaseSchema.extend({ kind: z.literal("income"), accountId: resourceIdSchema }),
  transactionBaseSchema.extend({ kind: z.literal("expense"), accountId: resourceIdSchema }),
  transactionBaseSchema
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
    }),
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
