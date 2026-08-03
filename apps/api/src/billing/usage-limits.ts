import type { BillingFeature } from "@zoption/shared";

export const FREE_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 4,
  file_import: 1,
};

export const PRO_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 100,
  file_import: 10,
};

export const EFFECTIVE_PRO_ENTITLEMENT_CONDITION = `EXISTS (
  SELECT 1 FROM effective_pro_entitlements WHERE tenant_id = ?
)`;

export function usageLimit(feature: BillingFeature, hasPro: boolean): number {
  return (hasPro ? PRO_LIMITS : FREE_LIMITS)[feature];
}
