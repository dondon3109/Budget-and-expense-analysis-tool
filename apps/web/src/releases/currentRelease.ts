export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ProductRelease {
  version: string;
  releasedOn: string;
  changes: readonly ReleaseChange[];
}

export const currentRelease: ProductRelease = {
  version: __APP_VERSION__,
  releasedOn: "August 3, 2026",
  changes: [
    {
      title: "PayPal payments are now live",
      description:
        "Pro subscriptions now use PayPal, with clearer payment-confirmation status and recovery when a confirmation is delayed.",
    },
    {
      title: "A more capable Financial Assistant",
      description:
        "Ask richer questions about your finances with improved planning support, clearer answers, and a more focused chat workspace.",
    },
    {
      title: "Assistant use now follows your billing cycle",
      description:
        "Your assistant allowance renews on a 14-day cycle, making usage easier to understand and track.",
    },
  ],
};
