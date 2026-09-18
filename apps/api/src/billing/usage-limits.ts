import type { BillingFeature } from "@zoption/shared";

/**
 * One monthly pool per metered feature. `ai_usage` counts one unit per billable AI operation,
 * however many provider calls that operation makes: assistant turns, speech-to-text, speech
 * synthesis, receipt vision, PDF entry, and voice transaction entry all draw the same unit.
 * The pool is enforced atomically by the billing_monthly_usage triggers, not by `requirePro`.
 */
export const FREE_LIMITS: Record<BillingFeature, number> = {
  ai_usage: 500,
  file_import: 1,
};

export const PRO_LIMITS: Record<BillingFeature, number> = {
  ai_usage: 2_000,
  file_import: 10,
};

export const EFFECTIVE_PRO_ENTITLEMENT_CONDITION = `EXISTS (
  SELECT 1 FROM effective_pro_entitlements WHERE tenant_id = ?
)`;
