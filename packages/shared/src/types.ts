export const transactionKinds = ["income", "expense", "transfer"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

export const currencies = ["PHP", "USD"] as const;
export type Currency = (typeof currencies)[number];

export const currencyMetadata: Record<Currency, { label: string; symbol: string; locale: string }> =
  {
    PHP: { label: "Philippine Peso (PHP)", symbol: "₱", locale: "en-PH" },
    USD: { label: "US Dollar (USD)", symbol: "$", locale: "en-US" },
  };

export interface TransactionRecord {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  kind: TransactionKind;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  accountName: string;
}

export interface TransactionListItem extends TransactionRecord {
  accountId: string | null;
  notes: string | null;
  transferGroupId?: string | null;
  fromAccountId?: string | null;
  fromAccountName?: string | null;
  toAccountId?: string | null;
  toAccountName?: string | null;
  transferFeeMinor?: number | null;
  legacyTransfer?: boolean;
}

export interface TransactionPage {
  items: TransactionListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransactionCalendarMonth {
  month: string;
  currency: Currency;
  items: TransactionListItem[];
  hasAnyTransactions: boolean;
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
}

export interface CalendarEventMonth {
  month: string;
  items: CalendarEventRecord[];
}

export const accountTypes = ["cash", "checking", "savings", "credit", "other"] as const;
export type AccountType = (typeof accountTypes)[number];

export const interestFrequencies = ["daily", "monthly", "yearly"] as const;
export type InterestFrequency = (typeof interestFrequencies)[number];

export interface InterestSettings {
  enabled: boolean;
  annualRateBasisPoints: number | null;
  frequency: InterestFrequency | null;
  payDay: number | null;
}

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balanceMinor: number | null;
  balanceAsOf?: string | null;
  balancesByCurrency?: Record<Currency, number>;
  archived: boolean;
  system?: boolean;
  interest?: InterestSettings;
}

export interface AccountBalanceSummaryItem {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balanceMinor: number;
  balancesByCurrency: Record<Currency, number>;
  archived: boolean;
  system: boolean;
  interest?: InterestSettings;
}

export interface AccountBalanceSummary {
  currency: "PHP";
  overallBalanceMinor: number;
  balancesByCurrency: Record<Currency, number>;
  items: AccountBalanceSummaryItem[];
}

export const categoryOrigins = ["starter", "custom", "system"] as const;
export type CategoryOrigin = (typeof categoryOrigins)[number];

export const categoryRequiredPlans = ["free", "zoption_pro"] as const;
export type CategoryRequiredPlan = (typeof categoryRequiredPlans)[number];

export interface CategoryRecord {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  archived: boolean;
  system: boolean;
  origin: CategoryOrigin;
  requiredPlan: CategoryRequiredPlan;
  locked: boolean;
}

export const subscriptionBillingCycles = ["monthly", "yearly"] as const;
export type SubscriptionBillingCycle = (typeof subscriptionBillingCycles)[number];

export const subscriptionStatuses = ["active", "canceled"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export interface SubscriptionRecord {
  id: string;
  name: string;
  amountMinor: number;
  currency: "PHP";
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  accountId: string | null;
  accountName: string | null;
}

export interface SubscriptionMonthItem extends SubscriptionRecord {
  billingDate: string | null;
  monthlyCostMinor: number;
}

export interface SubscriptionMonthSummary {
  month: string;
  currency: "PHP";
  totalMonthlyCostMinor: number;
  items: SubscriptionMonthItem[];
}

export interface ImportMapping {
  date?: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  category?: string;
  kind?: string;
  currency?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: "ready" | "invalid" | "duplicate";
  date?: string;
  description?: string;
  amountMinor?: number;
  kind?: TransactionKind;
  categoryId?: string;
  categoryName?: string;
  categoryIsUncategorized?: boolean;
  errors: string[];
}

export interface ImportPreview {
  token: string;
  expiresAt: string;
  fileName: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportCategoryOverride {
  rowNumber: number;
  categoryId: string;
}

export interface ImportKindOverride {
  rowNumber: number;
  kind: TransactionKind;
}

export interface ImportCommitRequest {
  token: string;
  categoryOverrides: ImportCategoryOverride[];
  kindOverrides: ImportKindOverride[];
}

export interface ImportCommitResult {
  importId: string;
  importedCount: number;
  rejectedCount: number;
}

export interface BudgetRecord {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  month: string;
  limitMinor: number;
}

export interface BudgetPlanItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usedPercent: number;
}

export interface BudgetMonthPlan {
  month: string;
  currency: "PHP";
  totalLimitMinor: number;
  totalSpentMinor: number;
  remainingMinor: number;
  usedPercent: number;
  items: BudgetPlanItem[];
}

export const financialGoalStatuses = ["active", "paused", "completed"] as const;
export type FinancialGoalStatus = (typeof financialGoalStatuses)[number];

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  targetDate: string;
  status: FinancialGoalStatus;
  createdAt: string;
  updatedAt: string;
}

export const debtTypes = [
  "credit_card",
  "personal_loan",
  "auto_loan",
  "mortgage",
  "other",
] as const;
export type DebtType = (typeof debtTypes)[number];

export const debtStatuses = ["active", "paid"] as const;
export type DebtStatus = (typeof debtStatuses)[number];

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  balanceMinor: number;
  aprBasisPoints: number;
  minimumPaymentMinor: number;
  balanceAsOf: string;
  status: DebtStatus;
  createdAt: string;
  updatedAt: string;
}

export const cashflowTrendViews = ["weekly", "monthly", "sixMonth"] as const;
export type CashflowTrendView = (typeof cashflowTrendViews)[number];

export interface CashflowTrend {
  view: CashflowTrendView;
  granularity: "day" | "month";
  range: { from: string; to: string };
  points: Array<{
    date: string;
    incomeMinor: number;
    expenseMinor: number;
  }>;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  currency: "PHP";
  accountBalances?: AccountBalanceSummary;
  metrics: {
    moneyInMinor: number;
    moneyOutMinor: number;
    netMinor: number;
    incomeByCurrency: Record<Currency, number>;
    expenseByCurrency: Record<Currency, number>;
    budgetLimitMinor: number;
    remainingBudgetMinor: number;
    budgetUsedPercent: number;
  };
  spendingByCategory: Array<{
    categoryId: string;
    name: string;
    color: string;
    amountMinor: number;
    sharePercent: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    incomeMinor: number;
    expenseMinor: number;
  }>;
  budgetProgress: Array<{
    categoryId: string;
    name: string;
    color: string;
    spentMinor: number;
    limitMinor: number;
    remainingMinor: number;
    usedPercent: number;
  }>;
  insights: {
    savingsMinor: number;
    savingsRatePercent: number | null;
    recurringExpenses: Array<{
      description: string;
      categoryName: string;
      averageMinor: number;
      occurrenceCount: number;
      latestMonth: string;
    }>;
  };
}

export interface TransferFeeWeek {
  /** Monday of the week, as an ISO date. */
  weekStart: string;
  /** Sunday of the week, as an ISO date. */
  weekEnd: string;
  /** Number of transfers (each transfer counts once) in that week. */
  transfers: number;
  /** Number of transfers that carried a fee in that week. */
  feeChargedTransfers: number;
  /** Total transfer fees paid in that week, per currency. */
  feesByCurrency: Record<Currency, number>;
}

export interface TransferFeeInsight {
  /** True when at least one fee-charged transfer has been recorded. */
  hasFees: boolean;
  /** All-time number of transfers (each transfer counts once). */
  totalTransfers: number;
  /** All-time number of transfers that carried a fee. */
  totalFeeChargedTransfers: number;
  /** All-time transfer fees paid, per currency. */
  feesByCurrency: Record<Currency, number>;
  /** Per-week breakdown for the trailing 8 weeks, oldest first. */
  weekly: TransferFeeWeek[];
  /** Number of weeks within the window that had at least one transfer. */
  recentWeekCount: number;
  /** Average transfers per week across the weeks that had activity. */
  recentAverageTransfersPerWeek: number;
  /** Average fee-charged transfers per week across the weeks that had activity. */
  recentAverageFeeChargedTransfersPerWeek: number;
}

export const billingIntervals = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

export const billingProviders = ["paypal"] as const;
export type BillingProvider = (typeof billingProviders)[number];

export const billingSubscriptionStatuses = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
] as const;
export type BillingSubscriptionStatus = (typeof billingSubscriptionStatuses)[number];

export type BillingPlan = "free" | "zoption_pro";
export type BillingFeature = "assistant_question" | "file_import";
export type BillingResource = "custom_category";
export type BillingCapability =
  | BillingFeature
  | "category_management"
  | "account_management"
  | "cashflow_analytics"
  | "transaction_export";

export type BillingUsagePeriodKind = "calendar_month" | "anchored_14_day";

export interface BillingUsage {
  feature: BillingFeature;
  used: number;
  limit: number;
  periodKind: BillingUsagePeriodKind;
  periodStartedAt: string | null;
  resetsAt: string | null;
}

export interface BillingResourceAllowance {
  resource: BillingResource;
  used: number;
  limit: number | null;
}

export const proEntitlementSources = ["paypal", "platform_admin", "sponsored"] as const;
export type ProEntitlementSource = (typeof proEntitlementSources)[number];

export type SponsoredProSeatState = "pending" | "active";

export interface SponsoredProSeat {
  slotNumber: number;
  state: SponsoredProSeatState;
  beneficiaryUserId: string | null;
  invitedAt: string | null;
  assignedAt: string | null;
  canResendInvitation: boolean;
}

export interface SponsoredProSeatSummary {
  capacity: 5;
  activeCount: number;
  pendingCount: number;
  availableCount: number;
  seats: SponsoredProSeat[];
}

export interface BillingPendingCheckout {
  provider: BillingProvider;
  interval: BillingInterval;
  createdAt: string;
  expiresAt: string;
}

export interface BillingSummary {
  plan: BillingPlan;
  entitlementSource: ProEntitlementSource | null;
  provider: BillingProvider | null;
  status: BillingSubscriptionStatus | null;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  cancelAtPeriodEnd: boolean;
  pendingCheckout: BillingPendingCheckout | null;
  canCheckout: boolean;
  canManageBilling: boolean;
  canManageSponsoredSeats: boolean;
  nonTerminalSubscriptionCount: number;
  usages: BillingUsage[];
  allowances: BillingResourceAllowance[];
}

export type BillingCheckoutReconciliationOutcome =
  "confirmed" | "pending" | "review_required" | "closed" | "none";

export interface BillingCheckoutReconciliation {
  outcome: BillingCheckoutReconciliationOutcome;
  summary: BillingSummary;
}

export type AssistantMessageRole = "user" | "assistant";
export type AssistantMessageStatus = "pending" | "completed" | "failed";

export type AssistantResponseDetail = "concise" | "standard";
export type AssistantCoachingStyle = "gentle" | "direct";
export type AssistantComplianceTopic =
  "investment" | "tax" | "retirement" | "insurance" | "estate_legal";
export type AssistantCompliancePosture =
  | "budgeting_allowed"
  | "general_education"
  | "restricted_topic_education"
  | "personalized_recommendation_redirect";
export type AssistantDataQualityStatus = "reliable" | "limited" | "insufficient";

export interface AssistantDateRange {
  from: string;
  to: string;
  label?: string;
}

export interface AssistantDataQualitySignal {
  code: string;
  message: string;
  count?: number;
}

export interface AssistantSourceMetadata {
  label: string;
  sourceType: "transactions" | "budgets" | "accounts" | "goals" | "debts";
  period?: AssistantDateRange;
  baselinePeriod?: AssistantDateRange;
  filters?: {
    accountName?: string;
    categoryName?: string;
    goalName?: string;
    debtNames?: string[];
  };
  recordCount?: number;
  dataQualityStatus: AssistantDataQualityStatus;
  limitations: string[];
}

export interface AssistantResponseMetadata {
  promptVersion: string;
  compliance: {
    posture: AssistantCompliancePosture;
    topics: AssistantComplianceTopic[];
  };
  resolvedPeriod?: AssistantDateRange;
  disclaimer?: {
    text: string;
    topics: AssistantComplianceTopic[];
  };
  sources: AssistantSourceMetadata[];
}

export const CURRENT_ASSISTANT_CONSENT_VERSION = 5;
export const CURRENT_ASSISTANT_VOICE_CONSENT_VERSION = 3;

export const assistantSpeechVoices = ["default", "bright", "energetic"] as const;
export type AssistantSpeechVoice = (typeof assistantSpeechVoices)[number];

export type AssistantDebtStrategy = "avalanche" | "snowball";
export type AssistantMemoryKind = "preference" | "fact" | "summary";
export type AssistantMemorySource = "user_stated" | "deterministic" | "model_assisted";

export interface AssistantMemory {
  id: string;
  kind: AssistantMemoryKind;
  key: string;
  value: string;
  source: AssistantMemorySource;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMemoryPreferences {
  debtStrategy: AssistantDebtStrategy | null;
  responseDetail: AssistantResponseDetail;
  coachingStyle: AssistantCoachingStyle;
}

export interface AssistantMemoryPreferencesUpdate {
  debtStrategy: AssistantDebtStrategy | null;
}

export interface AssistantToolResultEnvelope<T> {
  data: T;
  source: Omit<AssistantSourceMetadata, "label" | "dataQualityStatus" | "limitations">;
  dataQuality: {
    status: AssistantDataQualityStatus;
    signals: AssistantDataQualitySignal[];
  };
}

export interface AssistantPreferences {
  consentedAt: string | null;
  consentVersion: number;
  retentionDays: number;
  assistantName: string | null;
  userPreferredName: string | null;
  responseDetail: AssistantResponseDetail;
  coachingStyle: AssistantCoachingStyle;
}

export interface AssistantVoicePreferences {
  enabled: boolean;
  speechAvailable: boolean;
  reviewRequired: boolean;
  consentedAt: string | null;
  consentVersion: number;
  transcriptionModel: "@cf/openai/whisper-large-v3-turbo";
  ttsModel: "s2.1-pro-free";
}

export interface AssistantVoiceTranscription {
  text: string;
  durationSeconds: number;
  languageCode?: string;
}

/** Covers in-flight AI processing of receipt photos, statement PDFs, and voice entries. */
export const CURRENT_RECEIPT_CONSENT_VERSION = 2;

export interface ReceiptPreferences {
  enabled: boolean;
  consentedAt: string | null;
  consentVersion: number;
  visionModel: string;
}

/** A purchasable line read from a receipt. Amounts are always positive centavos. */
export interface ReceiptLineItem {
  description: string;
  amountMinor: number;
  categoryName?: string;
}

/** A review-only transaction draft parsed from a spoken entry. */
export interface TransactionVoiceDraft {
  transcript: string;
  description: string;
  date: string;
  amountMinor: number;
  currency: "PHP";
  kind: TransactionKind;
  categoryName?: string;
}

export interface ReceiptDraft {
  merchant: string;
  date: string;
  amountMinor: number;
  currency: "PHP";
  kind: TransactionKind;
  categoryName?: string;
  /** Omitted by earlier API deployments; an empty list means no line could be read confidently. */
  items?: ReceiptLineItem[];
  rawText: string;
}

export interface AssistantThread {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  threadId: string;
  role: AssistantMessageRole;
  content: string;
  status: AssistantMessageStatus;
  metadata?: AssistantResponseMetadata;
  createdAt: string;
}

export interface AssistantThreadPage {
  items: AssistantThread[];
  nextCursor: string | null;
}

export interface AssistantMessagePage {
  items: AssistantMessage[];
  nextCursor: string | null;
}

export interface AssistantTurnResult {
  thread: AssistantThread;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
}

export const bugReportCategories = [
  "ui",
  "data",
  "import",
  "billing",
  "authentication",
  "performance",
  "other",
] as const;
export type BugReportCategory = (typeof bugReportCategories)[number];

export const bugReportFrequencies = ["once", "sometimes", "always", "unknown"] as const;
export type BugReportFrequency = (typeof bugReportFrequencies)[number];

export const bugReportStatuses = [
  "new",
  "triaged",
  "needs_info",
  "in_progress",
  "resolved",
  "closed",
  "duplicate",
] as const;
export type BugReportStatus = (typeof bugReportStatuses)[number];

export const bugReportNotificationStatuses = ["pending", "sent", "failed"] as const;
export type BugReportNotificationStatus = (typeof bugReportNotificationStatuses)[number];

export const bugReportPageContexts = [
  "dashboard",
  "assistant",
  "calendar",
  "transactions",
  "import",
  "budgets",
  "subscriptions",
  "plan",
  "settings",
  "app",
] as const;
export type BugReportPageContext = (typeof bugReportPageContexts)[number];

export interface BugReportDraft {
  title: string;
  category: BugReportCategory;
  actualBehavior: string;
  expectedBehavior: string;
  stepsToReproduce: string;
  frequency: BugReportFrequency;
}

export interface BugReportDiagnostics {
  route: string;
  releaseVersion: string;
  viewportWidth: number;
  viewportHeight: number;
  displayMode: "browser" | "standalone";
  platform: "android" | "ios" | "desktop" | "other";
}

export interface BugReport {
  id: string;
  reference: string;
  title: string;
  category: BugReportCategory;
  actualBehavior: string;
  expectedBehavior: string;
  stepsToReproduce: string;
  frequency: BugReportFrequency;
  pageContext: BugReportPageContext;
  diagnostics: BugReportDiagnostics;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBugReport extends BugReport {
  reporterUserId: string;
  reporterEmail: string | null;
  notificationStatus: BugReportNotificationStatus;
  notificationAttempts: number;
  notifiedAt: string | null;
}

export interface PublicCustomerReview {
  id: string;
  displayName: string;
  rating: number;
  review: string;
  featuredOrder: number;
  updatedAt: string;
}

export const customerReviewModerationStatuses = ["pending", "published", "hidden"] as const;
export type CustomerReviewModerationStatus = (typeof customerReviewModerationStatuses)[number];

export interface CustomerReview extends Omit<PublicCustomerReview, "featuredOrder"> {
  publishConsent: boolean;
  moderationStatus: CustomerReviewModerationStatus;
  featuredOrder: number | null;
  createdAt: string;
}

export interface CustomerReviewState {
  review: CustomerReview | null;
  promptEligible: boolean;
}

export interface CustomerReviewAdminSummary {
  total: number;
  pending: number;
  published: number;
  hidden: number;
  featured: number;
}

export interface CustomerReviewAdminDashboard {
  items: CustomerReview[];
  lineup: CustomerReview[];
  summary: CustomerReviewAdminSummary;
  page: number;
  pageSize: number;
  totalFiltered: number;
  totalPages: number;
}
