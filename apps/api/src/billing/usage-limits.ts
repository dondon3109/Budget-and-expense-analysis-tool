import type { BillingFeature } from "@zoption/shared";

/**
 * The media AI features (receipt vision, speech-to-text, speech synthesis, PDF entry)
 * call a billable provider per request, so they are Pro-only and their free allowance is
 * zero. Entitlement is enforced with `requirePro` before the provider call; the allowance
 * keeps `usageLimit` honest for any future metered path.
 */
export const FREE_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 10,
  file_import: 1,
  vision: 0,
  stt: 0,
  tts: 0,
  pdf: 0,
};

export const PRO_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 100,
  file_import: 10,
  vision: 60,
  stt: 30,
  tts: 60,
  pdf: 20,
};

export const EFFECTIVE_PRO_ENTITLEMENT_CONDITION = `EXISTS (
  SELECT 1 FROM effective_pro_entitlements WHERE tenant_id = ?
)`;

export function usageLimit(feature: BillingFeature, hasPro: boolean): number {
  return (hasPro ? PRO_LIMITS : FREE_LIMITS)[feature];
}
