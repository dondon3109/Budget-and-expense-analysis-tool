import type { BillingCapability, BillingFeature, BillingResource } from "@zoption/shared";

export const capabilityLabels: Record<BillingCapability, string> = {
  assistant_question: "AI assistant questions",
  file_import: "file imports",
  category_management: "custom category management",
  account_management: "custom account management",
  cashflow_analytics: "cashflow analytics",
  transaction_export: "transaction exports",
};

export const featureLabels: Record<BillingFeature, string> = {
  assistant_question: "AI questions",
  file_import: "file imports",
};

export const resourceLabels: Record<BillingResource, string> = {
  custom_category: "custom categories",
};

export function formatManilaDate(value: string, includeTime = false): string | undefined {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Manila",
  }).format(date);
}
