/** Features the Worker serves only to a signed-in account, so a guest is asked to sign in first. */
export const accountFeatures = {
  assistant: "The AI Assistant",
  "receipt-scan": "Receipt scanning",
  import: "Transaction import",
  voice: "Voice entry",
  billing: "Plan & billing",
  account: "Account settings",
  support: "Help & support",
} as const;

export type AccountFeature = keyof typeof accountFeatures;

/** What an account adds on top of the on-device guest workspace; shown wherever a guest is invited to sign in. */
export const accountBenefits = [
  "Back up your data and sync it between your phone and the web",
  "The AI Assistant, receipt scanning, voice entry and bank-file import",
  "A 7-day Pro trial, no card needed",
] as const;
