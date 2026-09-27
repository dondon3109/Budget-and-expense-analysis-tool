// CSV/Excel import preview and commit contracts.

import { z } from "zod";

import { transactionKinds } from "../types";
import { isoDateSchema, resourceIdSchema } from "./common";

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
