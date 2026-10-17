// Comments on a family's transactions and remittances, and the owner's alert thresholds.

import { z } from "zod";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR } from "../limits";
import { resourceIdSchema } from "./common";

export const familyCommentSubjectKinds = ["transaction", "remittance"] as const;

/** Used when the owner has not set a threshold; null turns an alert off. */
export const FAMILY_ALERT_DEFAULTS = {
  spendingAlertMinor: 2_000_00,
  lowBalanceMinor: 1_000_00,
} as const;

export const familyCommentSubjectSchema = z
  .object({ kind: z.enum(familyCommentSubjectKinds), subjectId: resourceIdSchema })
  .strict();

export const familyCommentInputSchema = z
  .object({ body: z.string().trim().min(1).max(500) })
  .strict();

export const familyCommentSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    body: z.string(),
    createdAt: z.string().min(1),
  })
  .strict();

export const familyCommentListSchema = z
  .object({ comments: z.array(familyCommentSchema) })
  .strict();

const thresholdSchema = z.number().int().safe().positive().max(BUDGET_AND_SUBSCRIPTION_MAX_MINOR);

export const familyAlertSettingsSchema = z
  .object({
    /** Tell the owner about one family expense at or above this. */
    spendingAlertMinor: thresholdSchema.nullable(),
    /** Tell everyone when the family's money left drops below this. */
    lowBalanceMinor: thresholdSchema.nullable(),
  })
  .strict();

export type FamilyCommentSubjectKind = (typeof familyCommentSubjectKinds)[number];
export type FamilyCommentSubject = z.infer<typeof familyCommentSubjectSchema>;
export type FamilyCommentInput = z.infer<typeof familyCommentInputSchema>;
export type FamilyComment = z.infer<typeof familyCommentSchema>;
export type FamilyCommentList = z.infer<typeof familyCommentListSchema>;
export type FamilyAlertSettings = z.infer<typeof familyAlertSettingsSchema>;
