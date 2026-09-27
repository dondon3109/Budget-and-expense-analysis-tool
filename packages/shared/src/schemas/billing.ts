// Paid plan checkout, sponsored seats, and billing response contracts.

import { z } from "zod";

import {
  billingFeatures,
  billingProviders,
  billingUsagePeriodKinds,
  proEntitlementSources,
} from "../types";

export const billingCheckoutRequestSchema = z
  .object({
    interval: z.enum(["month", "year"]),
    // Optional so clients released before Dodo Payments keep checking out through PayPal.
    provider: z.enum(billingProviders).default("paypal"),
  })
  .strict();

export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;

export const sponsoredSeatEmailRequestSchema = z
  .object({ email: z.string().trim().email().max(320) })
  .strict();

export type SponsoredSeatEmailRequest = z.infer<typeof sponsoredSeatEmailRequestSchema>;

export const sponsoredSeatSlotSchema = z.coerce.number().int().min(1).max(5);

// Billing response contracts shared by the mobile client for the online-only
// surfaces.

export const billingUsageSchema = z
  .object({
    feature: z.enum(billingFeatures),
    used: z.number().int().min(0),
    limit: z.number().int().min(0),
    periodKind: z.enum(billingUsagePeriodKinds),
    periodStartedAt: z.iso.datetime().nullable(),
    resetsAt: z.iso.datetime().nullable(),
  })
  .strict();

export const billingResourceAllowanceSchema = z
  .object({
    resource: z.enum(["custom_category"]),
    used: z.number().int().min(0),
    limit: z.number().int().min(0).nullable(),
  })
  .strict();

export const billingSummaryResponseSchema = z
  .object({
    plan: z.enum(["free", "zoption_pro"]),
    entitlementSource: z.enum(proEntitlementSources).nullable(),
    provider: z.enum(billingProviders).nullable(),
    status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]).nullable(),
    interval: z.enum(["month", "year"]).nullable(),
    currentPeriodEndsAt: z.iso.datetime().nullable(),
    scheduledChangeAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    pendingCheckout: z
      .object({
        provider: z.enum(billingProviders),
        interval: z.enum(["month", "year"]),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    canCheckout: z.boolean(),
    canManageBilling: z.boolean(),
    canManageSponsoredSeats: z.boolean(),
    nonTerminalSubscriptionCount: z.number().int().min(0),
    usages: z.array(billingUsageSchema).max(10),
    allowances: z.array(billingResourceAllowanceSchema).max(10),
  })
  .strict();

/**
 * The Supabase Auth admin user lookup. Only the sign-in address is read; the rest of the record
 * is Supabase's to change, so unknown keys are allowed. Older API versions nest it in `user`.
 */
const supabaseAdminUserEmailSchema = z.object({ email: z.email() });
export const supabaseAdminUserResponseSchema = z.union([
  z.object({ user: supabaseAdminUserEmailSchema }),
  supabaseAdminUserEmailSchema,
]);

export const billingProviderConfigResponseSchema = z
  .object({
    provider: z.literal("paypal"),
    clientId: z.string().trim().min(1).max(512),
    environment: z.enum(["sandbox", "production"]),
  })
  .strict();

export type BillingProviderConfig = z.infer<typeof billingProviderConfigResponseSchema>;

export const billingCheckoutResponseSchema = z
  .object({
    approvalUrl: z.string().url(),
    /** PayPal only: its SDK opens the subscription it names. A Dodo checkout is a redirect. */
    subscriptionId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type BillingCheckoutResponse = z.infer<typeof billingCheckoutResponseSchema>;

export const billingCancelResponseSchema = z
  .object({ cancellationRequested: z.literal(true) })
  .strict();

export const billingReconciliationResponseSchema = z
  .object({
    outcome: z.enum(["confirmed", "pending", "review_required", "closed", "none"]),
    summary: billingSummaryResponseSchema,
  })
  .strict();
