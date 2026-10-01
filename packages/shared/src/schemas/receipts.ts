// Receipt scanning and voice transaction drafts.

import { z } from "zod";

import { transactionKinds } from "../types";
import { isoDateSchema } from "./common";

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

/**
 * Client-supplied transcript for transaction voice entry. One pooled AI unit buys one bounded
 * provider request, so the text that reaches the model is capped at the request boundary.
 */
export const entryVoiceTranscriptSchema = z.string().trim().min(1).max(2_000);

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

/** Most transactions one spoken note can log, so one pooled AI unit stays one bounded request. */
export const MAX_VOICE_ENTRY_DRAFTS = 10;

/** Widget voice notes can name several income or expense entries in one breath. */
export const transactionVoiceDraftsSchema = z
  .object({
    drafts: z
      .array(transactionVoiceDraftSchema.refine((draft) => draft.kind !== "transfer"))
      .min(1)
      .max(MAX_VOICE_ENTRY_DRAFTS),
  })
  .strict();

export type TransactionVoiceDrafts = z.infer<typeof transactionVoiceDraftsSchema>;
