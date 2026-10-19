// A family's entry history and its recently deleted entries.

import { z } from "zod";

import { currencies, transactionKinds } from "../types";
import { isoDateSchema } from "./common";

/** A deleted family entry can be restored by the owner for this long. */
export const FAMILY_RESTORE_DAYS = 30;

const timestampSchema = z.string().min(1);

/** An entry as a person reads it in the history: the fields they edit, by name. */
export const familyEntryViewSchema = z
  .object({
    date: isoDateSchema,
    description: z.string(),
    amountMinor: z.number().int(),
    currency: z.enum(currencies),
    kind: z.enum(transactionKinds),
    categoryName: z.string(),
    accountName: z.string(),
    notes: z.string().nullable(),
  })
  .strict();

export const familyEntryEventSchema = z
  .object({
    action: z.enum(["updated", "deleted", "restored"]),
    userId: z.string(),
    at: timestampSchema,
    before: familyEntryViewSchema.nullable(),
    after: familyEntryViewSchema.nullable(),
  })
  .strict();

export const familyEntryHistorySchema = z
  .object({ events: z.array(familyEntryEventSchema) })
  .strict();

export const familyDeletedEntrySchema = z
  .object({
    transactionId: z.string(),
    entry: familyEntryViewSchema,
    deletedByUserId: z.string(),
    deletedAt: timestampSchema,
    restoreUntil: timestampSchema,
  })
  .strict();

export const familyDeletedEntryListSchema = z
  .object({ entries: z.array(familyDeletedEntrySchema) })
  .strict();

export type FamilyEntryView = z.infer<typeof familyEntryViewSchema>;
export type FamilyEntryEvent = z.infer<typeof familyEntryEventSchema>;
export type FamilyEntryHistory = z.infer<typeof familyEntryHistorySchema>;
export type FamilyDeletedEntry = z.infer<typeof familyDeletedEntrySchema>;
export type FamilyDeletedEntryList = z.infer<typeof familyDeletedEntryListSchema>;

/** A family receipt photo's size cap; the web app shrinks larger photos before upload. */
export const FAMILY_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
/** Entries one upload can share a photo across: the items saved from one scanned receipt. */
export const FAMILY_RECEIPT_MAX_ENTRIES = 30;
