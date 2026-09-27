// Monthly budgets, savings goals, and debts.

import { z } from "zod";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR, GOAL_AND_DEBT_MAX_MINOR } from "../limits";
import { debtStatuses, debtTypes, financialGoalStatuses } from "../types";
import { isoDateSchema, monthStartSchema, resourceIdSchema } from "./common";

export const budgetQuerySchema = z.object({ month: monthStartSchema }).strict();

/** A monthly budget limit. Zero means the category is not budgeted. */
export const budgetLimitMinorSchema = z
  .number()
  .int()
  .safe()
  .min(0)
  .max(BUDGET_AND_SUBSCRIPTION_MAX_MINOR);

export const budgetUpsertSchema = z
  .object({
    month: monthStartSchema,
    items: z
      .array(
        z
          .object({
            categoryId: resourceIdSchema,
            limitMinor: budgetLimitMinorSchema,
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
    targetAmountMinor: z.number().int().safe().min(1).max(GOAL_AND_DEBT_MAX_MINOR),
    currentAmountMinor: z.number().int().safe().min(0).max(GOAL_AND_DEBT_MAX_MINOR),
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
    targetAmountMinor: z.number().int().safe().min(1).max(GOAL_AND_DEBT_MAX_MINOR).optional(),
    currentAmountMinor: z.number().int().safe().min(0).max(GOAL_AND_DEBT_MAX_MINOR).optional(),
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
    balanceMinor: z.number().int().safe().min(1).max(GOAL_AND_DEBT_MAX_MINOR),
    aprBasisPoints: z.number().int().min(0).max(10_000),
    minimumPaymentMinor: z.number().int().safe().min(0).max(GOAL_AND_DEBT_MAX_MINOR),
    balanceAsOf: isoDateSchema,
    status: z.enum(debtStatuses).default("active"),
  })
  .strict();
export type DebtInput = z.infer<typeof debtInputSchema>;

export const debtUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: z.enum(debtTypes).optional(),
    balanceMinor: z.number().int().safe().min(0).max(GOAL_AND_DEBT_MAX_MINOR).optional(),
    aprBasisPoints: z.number().int().min(0).max(10_000).optional(),
    minimumPaymentMinor: z.number().int().safe().min(0).max(GOAL_AND_DEBT_MAX_MINOR).optional(),
    balanceAsOf: isoDateSchema.optional(),
    status: z.enum(debtStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");
export type DebtUpdate = z.infer<typeof debtUpdateSchema>;
