import type { BillingInterval } from "@zoption/shared";

export const planFeatures = [
  {
    feature: "AI Assistant",
    free: "4 questions per 14-day cycle",
    pro: "100 questions per 14-day cycle",
  },
  {
    feature: "File imports",
    free: "1 committed import per month",
    pro: "10 committed imports per month",
  },
  {
    feature: "Custom categories",
    free: "1 active custom category, plus included starters",
    pro: "Unlimited active custom categories",
  },
  {
    feature: "Custom accounts",
    free: "Use included accounts",
    pro: "Add, rename, and remove custom accounts",
  },
  {
    feature: "Cashflow analytics",
    free: "Weekly cashflow view",
    pro: "Adds monthly and six-month cashflow views",
  },
  {
    feature: "Transaction export",
    free: "Not included",
    pro: "Filtered CSV export",
  },
] as const;

export const proCheckoutOptions: Array<{
  interval: BillingInterval;
  label: string;
  price: string;
}> = [
  { interval: "month", label: "Monthly", price: "₱149/month" },
  { interval: "year", label: "Annual", price: "₱1,299/year" },
];

export const paymentDisclosure =
  "Prices are charged in Philippine pesos. PayPal securely hosts subscription approval. Taxes if applicable may apply.";
