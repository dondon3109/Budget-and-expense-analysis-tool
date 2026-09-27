// The only import path for server calls. Tests vi.mock("../src/lib/api"), which replaces this
// barrel, so application code never imports a file in this folder directly. Transport helpers stay
// internal to the folder, and errors.ts exports only the public error types and guards.
export {
  ApiRequestError,
  isApiRequestError,
  isBillingEnforcementError,
  isMonthlyLimitReachedError,
  isResourceLimitReachedError,
  isSubscriptionBlocksAccountDeletionError,
  isUpgradeRequiredError,
  isUsageLimitReachedError,
  type ResourceLimitReachedDetails,
  type UpgradeRequiredDetails,
  type UsageLimitReachedDetails,
} from "./errors";
export * from "./account-deletion";
export * from "./accounts";
export * from "./admin-providers";
export * from "./ai-entry";
export * from "./assistant";
export * from "./avatar";
export * from "./billing";
export * from "./budgets";
export * from "./bug-reports";
export * from "./categories";
export * from "./dashboard";
export * from "./debts";
export * from "./events";
export * from "./exports";
export * from "./goals";
export * from "./imports";
export * from "./platform-admin";
export * from "./receipts";
export * from "./reviews";
export * from "./subscriptions";
export * from "./support";
export * from "./transactions";
