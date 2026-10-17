// Family remittances: money sent home, recorded as sent by the sender and confirmed as received
// by someone at home. Only a received remittance has a transaction, so only received money
// counts toward the family's balances.

import { z } from "zod";

import { currencies } from "../types";
import { isoDateSchema, monthStartSchema, resourceIdSchema } from "./common";

const positiveMinorSchema = z.number().int().safe().positive();

/** What arrived: the peso amount, the family account it landed in, and its income category. */
export const familyRemittanceReceiveSchema = z
  .object({
    amountMinor: positiveMinorSchema,
    accountId: resourceIdSchema,
    categoryId: resourceIdSchema,
    date: isoDateSchema,
  })
  .strict();

/** A send; `received` records both steps at once when the arriving amount is already known. */
export const familyRemittanceSendSchema = z
  .object({
    sentAmountMinor: positiveMinorSchema,
    sentCurrency: z.enum(currencies),
    feeMinor: z.number().int().safe().min(0).optional(),
    provider: z.string().trim().max(60).optional(),
    sentOn: isoDateSchema,
    note: z.string().trim().max(240).optional(),
    received: familyRemittanceReceiveSchema.optional(),
  })
  .strict();

export const familyRemittanceSchema = z
  .object({
    id: z.string(),
    sentByUserId: z.string(),
    sentAmountMinor: z.number().int(),
    sentCurrency: z.enum(currencies),
    feeMinor: z.number().int(),
    provider: z.string().nullable(),
    sentOn: isoDateSchema,
    note: z.string().nullable(),
    /** Set once someone confirms it arrived; the amount is read from its income transaction. */
    received: z
      .object({
        transactionId: z.string(),
        amountMinor: z.number().int(),
        currency: z.enum(currencies),
        date: isoDateSchema,
        byUserId: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const remittanceMonthSchema = z
  .object({
    month: monthStartSchema,
    /** Received remittances dated in the month, in the family currency. */
    sentMinor: z.number().int(),
    /** Family expenses dated in the month, in the family currency. */
    spentMinor: z.number().int(),
  })
  .strict();

/** The Sent · Spent · Left card and its history. */
export const familyRemittanceOverviewSchema = z
  .object({
    currency: z.enum(currencies),
    month: remittanceMonthSchema,
    /** The family's own account balances in the family currency; shared balances never count. */
    leftMinor: z.number().int(),
    pending: z.array(familyRemittanceSchema),
    recent: z.array(familyRemittanceSchema),
    /** Earlier months, newest first, back to the first month with a remittance. */
    history: z.array(remittanceMonthSchema),
    hasRemittances: z.boolean(),
  })
  .strict();

export const familyRemittanceOverviewQuerySchema = z.object({ month: monthStartSchema }).strict();

export type FamilyRemittanceReceiveInput = z.infer<typeof familyRemittanceReceiveSchema>;
export type FamilyRemittanceSendInput = z.infer<typeof familyRemittanceSendSchema>;
export type FamilyRemittance = z.infer<typeof familyRemittanceSchema>;
export type FamilyRemittanceOverview = z.infer<typeof familyRemittanceOverviewSchema>;
