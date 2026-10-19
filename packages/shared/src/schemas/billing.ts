// Paid plan checkout, sponsored seats, and billing response contracts.

import { z } from "zod";

import {
  billingFeatures,
  billingIntervals,
  billingProviders,
  billingUsagePeriodKinds,
  proEntitlementSources,
} from "../billing";
import {
  billingPlanKeys,
  billingTiers,
  familyBillingPlans,
  familyPlanStates,
  personalBillingPlans,
} from "../plans";

const billingIntervalSchema = z.enum(billingIntervals);

export const billingCheckoutRequestSchema = z
  .object({
    plan: z.enum(personalBillingPlans),
    interval: billingIntervalSchema,
    provider: z.enum(billingProviders),
  })
  .strict();

export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;

export const familyBillingCheckoutRequestSchema = z
  .object({
    plan: z.enum(familyBillingPlans),
    interval: billingIntervalSchema,
    provider: z.enum(billingProviders),
  })
  .strict();

export type FamilyBillingCheckoutRequest = z.infer<typeof familyBillingCheckoutRequestSchema>;

/** Switch the plan or interval of the subscription already paid for. */
export const billingPlanChangeRequestSchema = z
  .object({ plan: z.enum(billingPlanKeys), interval: billingIntervalSchema })
  .strict();

export type BillingPlanChangeRequest = z.infer<typeof billingPlanChangeRequestSchema>;

export const billingPlanChangeResponseSchema = z
  .object({
    /** `scheduled` is a downgrade waiting for the period to end. */
    outcome: z.enum(["applied", "scheduled", "approval_required"]),
    /** PayPal only: a PayPal-balance subscriber approves the new price there. */
    approvalUrl: z.string().url().nullable(),
  })
  .strict();

export type BillingPlanChangeResponse = z.infer<typeof billingPlanChangeResponseSchema>;

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

const billingSubscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
]);

const billingPendingCheckoutSchema = z
  .object({
    provider: z.enum(billingProviders),
    plan: z.enum(billingPlanKeys),
    interval: billingIntervalSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

const billingPendingChangeSchema = z
  .object({
    plan: z.enum(billingPlanKeys),
    interval: billingIntervalSchema,
    effectiveAt: z.iso.datetime(),
  })
  .strict();

export const billingSummaryResponseSchema = z
  .object({
    plan: z.enum(billingTiers),
    entitlementSource: z.enum(proEntitlementSources).nullable(),
    subscriptionPlan: z.enum(personalBillingPlans).nullable(),
    provider: z.enum(billingProviders).nullable(),
    status: billingSubscriptionStatusSchema.nullable(),
    interval: billingIntervalSchema.nullable(),
    currentPeriodEndsAt: z.iso.datetime().nullable(),
    scheduledChangeAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    pendingChange: billingPendingChangeSchema.nullable(),
    pendingCheckout: billingPendingCheckoutSchema.nullable(),
    coveredBy: z
      .object({
        familyId: z.string().min(1).max(128),
        familyName: z.string().min(1).max(200),
        plan: z.enum(familyBillingPlans),
      })
      .strict()
      .nullable(),
    canCheckout: z.boolean(),
    canChangePlan: z.boolean(),
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

/**
 * A family's plan as its owner sees it in Family settings. `unpaid` was never paid for (the
 * owner uses it alone, invites wait for a plan); `lapsed` was paid and ended, so it is read-only.
 */
export const familyBillingSummaryResponseSchema = z
  .object({
    state: z.enum(familyPlanStates),
    plan: z.enum(familyBillingPlans).nullable(),
    interval: billingIntervalSchema.nullable(),
    provider: z.enum(billingProviders).nullable(),
    status: billingSubscriptionStatusSchema.nullable(),
    currentPeriodEndsAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    /** False when a previous owner pays: the plan ends with their period. */
    paidByYou: z.boolean(),
    pendingChange: billingPendingChangeSchema.nullable(),
    pendingCheckout: billingPendingCheckoutSchema.nullable(),
    canCheckout: z.boolean(),
    canChangePlan: z.boolean(),
  })
  .strict();

export type FamilyBillingSummary = z.infer<typeof familyBillingSummaryResponseSchema>;

export const billingCancelResponseSchema = z
  .object({ cancellationRequested: z.literal(true) })
  .strict();

export const billingReconciliationResponseSchema = z
  .object({
    outcome: z.enum(["confirmed", "pending", "review_required", "closed", "none"]),
    summary: billingSummaryResponseSchema,
  })
  .strict();
