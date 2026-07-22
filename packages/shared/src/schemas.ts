import { z } from "zod";

import { subscriptionBillingCycles, subscriptionStatuses, transactionKinds } from "./types";

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

export const transactionInputSchema = z.object({
  date: isoDateSchema,
  description: z.string().trim().min(1).max(240),
  amountMinor: z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0, "Amount cannot be zero."),
  currency: z.literal("PHP"),
  kind: z.enum(transactionKinds),
  categoryId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionUpdateSchema = transactionInputSchema
  .partial()
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
  })
  .superRefine((input, context) => {
    const rowNumbers = input.categoryOverrides.map((override) => override.rowNumber);
    if (new Set(rowNumbers).size !== rowNumbers.length) {
      context.addIssue({
        code: "custom",
        path: ["categoryOverrides"],
        message: "Each import row can have only one category override.",
      });
    }
  });
