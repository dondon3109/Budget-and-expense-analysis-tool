// Recurring bills (not the paid plan; see billing).

import { z } from "zod";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR } from "../limits";
import { subscriptionBillingCycles, subscriptionStatuses } from "../types";
import { isoDateSchema, monthStartSchema, resourceIdSchema } from "./common";

export const subscriptionQuerySchema = z.object({ month: monthStartSchema }).strict();

export const subscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    amountMinor: z.number().int().safe().min(1).max(BUDGET_AND_SUBSCRIPTION_MAX_MINOR),
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
