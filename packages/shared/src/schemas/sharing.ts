// Public share links: a frozen snapshot of one transaction or one account balance that anyone
// holding the link can read. The snapshot is the whole public surface, so it carries only what
// the owner chose to show and never an id, account name, or other workspace data.

import { z } from "zod";

import { currencies, shareLinkExpiries, shareLinkKinds } from "../types";
import { isoDateSchema, resourceIdSchema } from "./common";

/** Optional name shown as "Shared by"; blank means the page says "A Zoption user". */
const sharerNameSchema = z.string().trim().max(40).optional();

export const shareLinkCreateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("transaction"),
      transactionId: resourceIdSchema,
      // The amount is always shown; every other field is opt in.
      show: z
        .object({
          description: z.boolean(),
          category: z.boolean(),
          date: z.boolean(),
          note: z.boolean(),
        })
        .strict(),
      sharerName: sharerNameSchema,
      expiry: z.enum(shareLinkExpiries),
    })
    .strict(),
  z
    .object({
      kind: z.literal("balance"),
      accountId: resourceIdSchema,
      sharerName: sharerNameSchema,
      expiry: z.enum(shareLinkExpiries),
    })
    .strict(),
]);

export const sharedTransactionSnapshotSchema = z
  .object({
    kind: z.literal("transaction"),
    direction: z.enum(["income", "expense"]),
    /** Unsigned; `direction` carries the sign. */
    amountMinor: z.number().int().nonnegative(),
    currency: z.enum(currencies),
    description: z.string().nullable(),
    categoryName: z.string().nullable(),
    date: isoDateSchema.nullable(),
    note: z.string().nullable(),
  })
  .strict();

export const sharedBalanceSnapshotSchema = z
  .object({
    kind: z.literal("balance"),
    /** Signed: a liability account can be below zero. */
    amountMinor: z.number().int(),
    currency: z.enum(currencies),
    asOf: isoDateSchema,
  })
  .strict();

export const shareSnapshotSchema = z.discriminatedUnion("kind", [
  sharedTransactionSnapshotSchema,
  sharedBalanceSnapshotSchema,
]);

/** What `GET /api/public/shares/:token` returns to anyone holding the link. */
export const publicShareLinkSchema = z
  .object({
    snapshot: shareSnapshotSchema,
    sharerName: z.string().nullable(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .strict();

/**
 * The create response. `url` holds the token and is returned only this once; the snapshot comes
 * back so a client can render the share image from exactly what the link shows.
 */
export const shareLinkCreatedSchema = z
  .object({
    id: z.string(),
    url: z.string().url(),
    snapshot: shareSnapshotSchema,
    sharerName: z.string().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict();

/** One of the owner's active links, for the manage-and-revoke list. Never carries the token. */
export const shareLinkSchema = z
  .object({
    id: z.string(),
    kind: z.enum(shareLinkKinds),
    snapshot: shareSnapshotSchema,
    sharerName: z.string().nullable(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .strict();

export const shareLinkListSchema = z.object({ items: z.array(shareLinkSchema) }).strict();

export type ShareLinkCreateInput = z.infer<typeof shareLinkCreateSchema>;
export type SharedTransactionSnapshot = z.infer<typeof sharedTransactionSnapshotSchema>;
export type SharedBalanceSnapshot = z.infer<typeof sharedBalanceSnapshotSchema>;
export type ShareSnapshot = z.infer<typeof shareSnapshotSchema>;
export type PublicShareLink = z.infer<typeof publicShareLinkSchema>;
export type ShareLinkCreated = z.infer<typeof shareLinkCreatedSchema>;
export type ShareLink = z.infer<typeof shareLinkSchema>;
