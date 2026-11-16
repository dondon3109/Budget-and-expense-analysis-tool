// Recurring bills (not the paid plan; see billing).

import { z } from "zod";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR } from "../limits";
import { currencies, subscriptionBillingCycles, subscriptionStatuses } from "../types";
import { isoDateSchema, monthStartSchema, resourceIdSchema } from "./common";

export const subscriptionQuerySchema = z.object({ month: monthStartSchema }).strict();

export const subscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    amountMinor: z.number().int().safe().min(1).max(BUDGET_AND_SUBSCRIPTION_MAX_MINOR),
    /**
     * The currency the subscription is billed and charged in. A create without it takes the
     * workspace currency; an update without it keeps the stored one. Optional so native clients
     * that predate it still validate.
     */
    currency: z.enum(currencies).optional(),
    billingCycle: z.enum(subscriptionBillingCycles),
    nextBillingDate: isoDateSchema,
    categoryId: resourceIdSchema,
    accountId: resourceIdSchema,
  })
  .strict();

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const subscriptionUpdateSchema = subscriptionInputSchema;

export type SubscriptionUpdate = z.infer<typeof subscriptionUpdateSchema>;

export const subscriptionStatusUpdateSchema = z
  .object({
    status: z.enum(subscriptionStatuses),
  })
  .strict();

export type SubscriptionStatusUpdate = z.infer<typeof subscriptionStatusUpdateSchema>;

/**
 * Subscription ROI (Pro): one "used it" check-in per subscription per day. Online only; the
 * log is a REST surface and never enters mobile sync.
 */
export const subscriptionUsageInputSchema = z.object({ usedOn: isoDateSchema }).strict();

export type SubscriptionUsageInput = z.infer<typeof subscriptionUsageInputSchema>;

/** One subscription's check-in days within `SUBSCRIPTION_USAGE_WINDOW_DAYS`, oldest first. */
export const subscriptionUsageSchema = z
  .object({ subscriptionId: resourceIdSchema, usedOn: z.array(isoDateSchema) })
  .strict();

export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

/** Turns usage tracking on or off for one subscription ("Track usage"). */
export const subscriptionUsageTrackingInputSchema = z.object({ tracked: z.boolean() }).strict();

export type SubscriptionUsageTrackingInput = z.infer<typeof subscriptionUsageTrackingInputSchema>;

/** A choice the person made; a subscription without one follows `isUsageTrackedByDefault`. */
export const subscriptionUsageTrackingSchema = z
  .object({ subscriptionId: resourceIdSchema, tracked: z.boolean() })
  .strict();

export type SubscriptionUsageTracking = z.infer<typeof subscriptionUsageTrackingSchema>;

/** Every subscription with a check-in in the window, and every explicit tracking choice. */
export const subscriptionUsageListSchema = z
  .object({
    usage: z.array(subscriptionUsageSchema),
    tracking: z.array(subscriptionUsageTrackingSchema),
  })
  .strict();

export type SubscriptionUsageList = z.infer<typeof subscriptionUsageListSchema>;
