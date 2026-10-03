// Accounts, transactions, and the dashboard and calendar queries over them.

import { z } from "zod";

import { accountTypes, currencies, interestFrequencies, transactionKinds } from "../types";
import { isoDateSchema, monthStartSchema, resourceIdSchema } from "./common";

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
    /** Chosen when the account is created and fixed after; omitted means the workspace currency. */
    currency: z.enum(currencies).optional(),
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

/**
 * A transfer that may pay down a debt. Only a transfer into a liability account (credit card,
 * payable) can carry the link; the server checks that against the stored account.
 */
export const debtLinkedTransferInputSchema = transferInputSchema.safeExtend({
  debtId: resourceIdSchema.nullable().optional(),
});

export const transactionInputSchema = z.discriminatedUnion("kind", [
  transactionBaseSchema.extend({ kind: z.literal("income"), accountId: resourceIdSchema }),
  transactionBaseSchema.extend({
    kind: z.literal("expense"),
    accountId: resourceIdSchema,
    // Optional because a native client that predates debt linking still creates a
    // valid expense row for the debt payment category, just without the link. Null is
    // an explicit "no debt", which is how an edit drops a link it no longer wants.
    debtId: resourceIdSchema.nullable().optional(),
  }),
  debtLinkedTransferInputSchema,
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
    /** Null clears the link; omitting it leaves the stored debt untouched. */
    debtId: resourceIdSchema.nullable().optional(),
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

export const transactionCalendarQuerySchema = z.object({ month: monthStartSchema }).strict();

export type TransactionCalendarQuery = z.infer<typeof transactionCalendarQuerySchema>;
