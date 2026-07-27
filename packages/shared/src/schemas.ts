import { z } from "zod";

import {
  accountTypes,
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

export const dashboardQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

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

export const assistantPreferenceUpdateSchema = z
  .object({
    consented: z.literal(true),
  })
  .strict();

export type AssistantPreferenceUpdate = z.infer<typeof assistantPreferenceUpdateSchema>;

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

export const assistantPeriodSummaryToolSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
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

export const accountTypeSchema = z.enum(accountTypes);

const transactionBaseSchema = z.object({
  date: isoDateSchema,
  description: z.string().trim().min(1).max(240),
  amountMinor: z
    .number()
    .int()
    .safe()
    .refine((value) => value > 0, "Amount must be greater than zero."),
  currency: z.literal("PHP"),
  categoryId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export const transactionInputSchema = z.discriminatedUnion("kind", [
  transactionBaseSchema.extend({ kind: z.literal("income"), accountId: z.string().min(1) }),
  transactionBaseSchema.extend({ kind: z.literal("expense"), accountId: z.string().min(1) }),
  transactionBaseSchema
    .extend({
      kind: z.literal("transfer"),
      fromAccountId: z.string().min(1),
      toAccountId: z.string().min(1),
    })
    .refine((value) => value.fromAccountId !== value.toAccountId, {
      path: ["toAccountId"],
      message: "Choose different accounts for a transfer.",
    }),
]);

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionUpdateSchema = z
  .object({
    date: isoDateSchema.optional(),
    description: z.string().trim().min(1).max(240).optional(),
    amountMinor: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0, "Amount cannot be zero.")
      .optional(),
    currency: z.literal("PHP").optional(),
    kind: z.enum(transactionKinds).optional(),
    categoryId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    fromAccountId: z.string().min(1).optional(),
    toAccountId: z.string().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;

const transactionFilterShape = {
  search: z.string().trim().max(120).optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
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
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const transactionExportQuerySchema = z
  .object(transactionFilterShape)
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export type TransactionExportQuery = z.infer<typeof transactionExportQuerySchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(transactionKinds),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color."),
});

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
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const monthStartSchema = isoDateSchema.refine(
  (value) => value.endsWith("-01"),
  "Use the first day of the month.",
);

export const transactionCalendarQuerySchema = z.object({ month: monthStartSchema });

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
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;

export const calendarEventQuerySchema = z.object({ month: monthStartSchema });

export type CalendarEventQuery = z.infer<typeof calendarEventQuerySchema>;

export const budgetQuerySchema = z.object({ month: monthStartSchema });

export const budgetUpsertSchema = z.object({
  month: monthStartSchema,
  items: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        limitMinor: z.number().int().safe().min(0).max(1_000_000_000_00),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.categoryId)).size === items.length,
      "Budget categories must be unique.",
    ),
});

export type BudgetUpsert = z.infer<typeof budgetUpsertSchema>;

export const subscriptionQuerySchema = z.object({ month: monthStartSchema });

export const subscriptionInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().safe().min(1).max(1_000_000_000_00),
  billingCycle: z.enum(subscriptionBillingCycles),
  nextBillingDate: isoDateSchema,
  categoryId: z.string().min(1),
});

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const subscriptionStatusUpdateSchema = z.object({
  status: z.enum(subscriptionStatuses),
});

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
        z.object({
          rowNumber: z.number().int().min(1),
          categoryId: z.string().min(1),
        }),
      )
      .max(500)
      .default([]),
    kindOverrides: z
      .array(
        z.object({
          rowNumber: z.number().int().min(1),
          kind: z.enum(transactionKinds),
        }),
      )
      .max(500)
      .default([]),
  })
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
