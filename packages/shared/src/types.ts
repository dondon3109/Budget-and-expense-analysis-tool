import type { AssistantTransactionDraft } from "./schemas/assistant";

export const transactionKinds = ["income", "expense", "transfer"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

/**
 * Every currency an account, transaction, subscription, or workspace can be kept in. PHP leads
 * as the original default; the rest follow roughly by region. Amounts in every currency are
 * stored as integer hundredths of the major unit, even for currencies that print no decimals
 * (JPY, KRW, VND, CLP) or three (KWD, BHD, OMR), so one money rule covers them all.
 */
export const currencies = ["PHP", "USD", "EUR", "GBP", "JPY", "CNY", "HKD", "TWD", "KRW", "SGD", "MYR", "THB", "IDR", "VND", "INR", "PKR", "BDT", "LKR", "NPR", "AUD", "NZD", "CAD", "MXN", "BRL", "ARS", "CLP", "COP", "PEN", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ILS", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "EGP", "ZAR", "NGN", "KES"] as const;
export type Currency = (typeof currencies)[number];

export const currencyMetadata: Record<
  Currency,
  { label: string; name: string; plural: string; symbol: string; locale: string }
> = {
  PHP: { label: "Philippine Peso (PHP)", name: "Philippine Peso", plural: "Philippine pesos", symbol: "₱", locale: "en-PH" },
  USD: { label: "US Dollar (USD)", name: "US Dollar", plural: "US dollars", symbol: "$", locale: "en-US" },
  EUR: { label: "Euro (EUR)", name: "Euro", plural: "euros", symbol: "€", locale: "de-DE" },
  GBP: { label: "British Pound (GBP)", name: "British Pound", plural: "British pounds", symbol: "£", locale: "en-GB" },
  JPY: { label: "Japanese Yen (JPY)", name: "Japanese Yen", plural: "Japanese yen", symbol: "¥", locale: "ja-JP" },
  CNY: { label: "Chinese Yuan (CNY)", name: "Chinese Yuan", plural: "Chinese yuan", symbol: "CN¥", locale: "zh-CN" },
  HKD: { label: "Hong Kong Dollar (HKD)", name: "Hong Kong Dollar", plural: "Hong Kong dollars", symbol: "HK$", locale: "en-HK" },
  TWD: { label: "New Taiwan Dollar (TWD)", name: "New Taiwan Dollar", plural: "New Taiwan dollars", symbol: "NT$", locale: "zh-TW" },
  KRW: { label: "South Korean Won (KRW)", name: "South Korean Won", plural: "South Korean won", symbol: "₩", locale: "ko-KR" },
  SGD: { label: "Singapore Dollar (SGD)", name: "Singapore Dollar", plural: "Singapore dollars", symbol: "S$", locale: "en-SG" },
  MYR: { label: "Malaysian Ringgit (MYR)", name: "Malaysian Ringgit", plural: "Malaysian ringgit", symbol: "RM", locale: "ms-MY" },
  THB: { label: "Thai Baht (THB)", name: "Thai Baht", plural: "Thai baht", symbol: "฿", locale: "th-TH" },
  IDR: { label: "Indonesian Rupiah (IDR)", name: "Indonesian Rupiah", plural: "Indonesian rupiah", symbol: "Rp", locale: "id-ID" },
  VND: { label: "Vietnamese Dong (VND)", name: "Vietnamese Dong", plural: "Vietnamese dong", symbol: "₫", locale: "vi-VN" },
  INR: { label: "Indian Rupee (INR)", name: "Indian Rupee", plural: "Indian rupees", symbol: "₹", locale: "en-IN" },
  PKR: { label: "Pakistani Rupee (PKR)", name: "Pakistani Rupee", plural: "Pakistani rupees", symbol: "Rs", locale: "en-PK" },
  BDT: { label: "Bangladeshi Taka (BDT)", name: "Bangladeshi Taka", plural: "Bangladeshi taka", symbol: "৳", locale: "bn-BD" },
  LKR: { label: "Sri Lankan Rupee (LKR)", name: "Sri Lankan Rupee", plural: "Sri Lankan rupees", symbol: "Rs", locale: "en-LK" },
  NPR: { label: "Nepalese Rupee (NPR)", name: "Nepalese Rupee", plural: "Nepalese rupees", symbol: "Rs", locale: "ne-NP" },
  AUD: { label: "Australian Dollar (AUD)", name: "Australian Dollar", plural: "Australian dollars", symbol: "A$", locale: "en-AU" },
  NZD: { label: "New Zealand Dollar (NZD)", name: "New Zealand Dollar", plural: "New Zealand dollars", symbol: "NZ$", locale: "en-NZ" },
  CAD: { label: "Canadian Dollar (CAD)", name: "Canadian Dollar", plural: "Canadian dollars", symbol: "CA$", locale: "en-CA" },
  MXN: { label: "Mexican Peso (MXN)", name: "Mexican Peso", plural: "Mexican pesos", symbol: "MX$", locale: "es-MX" },
  BRL: { label: "Brazilian Real (BRL)", name: "Brazilian Real", plural: "Brazilian reais", symbol: "R$", locale: "pt-BR" },
  ARS: { label: "Argentine Peso (ARS)", name: "Argentine Peso", plural: "Argentine pesos", symbol: "AR$", locale: "es-AR" },
  CLP: { label: "Chilean Peso (CLP)", name: "Chilean Peso", plural: "Chilean pesos", symbol: "CL$", locale: "es-CL" },
  COP: { label: "Colombian Peso (COP)", name: "Colombian Peso", plural: "Colombian pesos", symbol: "CO$", locale: "es-CO" },
  PEN: { label: "Peruvian Sol (PEN)", name: "Peruvian Sol", plural: "Peruvian soles", symbol: "S/", locale: "es-PE" },
  CHF: { label: "Swiss Franc (CHF)", name: "Swiss Franc", plural: "Swiss francs", symbol: "CHF", locale: "de-CH" },
  SEK: { label: "Swedish Krona (SEK)", name: "Swedish Krona", plural: "Swedish kronor", symbol: "kr", locale: "sv-SE" },
  NOK: { label: "Norwegian Krone (NOK)", name: "Norwegian Krone", plural: "Norwegian kroner", symbol: "kr", locale: "nb-NO" },
  DKK: { label: "Danish Krone (DKK)", name: "Danish Krone", plural: "Danish kroner", symbol: "kr", locale: "da-DK" },
  PLN: { label: "Polish Złoty (PLN)", name: "Polish Złoty", plural: "Polish złoty", symbol: "zł", locale: "pl-PL" },
  CZK: { label: "Czech Koruna (CZK)", name: "Czech Koruna", plural: "Czech korunas", symbol: "Kč", locale: "cs-CZ" },
  HUF: { label: "Hungarian Forint (HUF)", name: "Hungarian Forint", plural: "Hungarian forints", symbol: "Ft", locale: "hu-HU" },
  TRY: { label: "Turkish Lira (TRY)", name: "Turkish Lira", plural: "Turkish lira", symbol: "₺", locale: "tr-TR" },
  ILS: { label: "Israeli New Shekel (ILS)", name: "Israeli New Shekel", plural: "Israeli new shekels", symbol: "₪", locale: "he-IL" },
  AED: { label: "UAE Dirham (AED)", name: "UAE Dirham", plural: "UAE dirhams", symbol: "AED", locale: "en-AE" },
  SAR: { label: "Saudi Riyal (SAR)", name: "Saudi Riyal", plural: "Saudi riyals", symbol: "SAR", locale: "en-SA" },
  QAR: { label: "Qatari Riyal (QAR)", name: "Qatari Riyal", plural: "Qatari riyals", symbol: "QAR", locale: "en-QA" },
  KWD: { label: "Kuwaiti Dinar (KWD)", name: "Kuwaiti Dinar", plural: "Kuwaiti dinars", symbol: "KD", locale: "en-KW" },
  BHD: { label: "Bahraini Dinar (BHD)", name: "Bahraini Dinar", plural: "Bahraini dinars", symbol: "BD", locale: "en-BH" },
  OMR: { label: "Omani Rial (OMR)", name: "Omani Rial", plural: "Omani rials", symbol: "OMR", locale: "en-OM" },
  EGP: { label: "Egyptian Pound (EGP)", name: "Egyptian Pound", plural: "Egyptian pounds", symbol: "E£", locale: "en-EG" },
  ZAR: { label: "South African Rand (ZAR)", name: "South African Rand", plural: "South African rand", symbol: "R", locale: "en-ZA" },
  NGN: { label: "Nigerian Naira (NGN)", name: "Nigerian Naira", plural: "Nigerian naira", symbol: "₦", locale: "en-NG" },
  KES: { label: "Kenyan Shilling (KES)", name: "Kenyan Shilling", plural: "Kenyan shillings", symbol: "KSh", locale: "en-KE" },
};

const currencySet: ReadonlySet<string> = new Set(currencies);

/** Currencies printed without a minor unit. Their amounts still store hundredths. */
const zeroDecimalCurrencies: ReadonlySet<Currency> = new Set(["JPY", "KRW", "VND", "CLP"]);

/**
 * Decimal places to print an amount with: none for a zero-decimal currency holding a whole
 * amount, otherwise two, so a fractional amount is never rounded away on screen.
 */
export function currencyFractionDigits(currency: Currency, amountMinor: number): 0 | 2 {
  return zeroDecimalCurrencies.has(currency) && amountMinor % 100 === 0 ? 0 : 2;
}

/** Narrows untrusted text (a stored row, a CSV cell, a remembered setting) to a supported currency. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && currencySet.has(value);
}

/** Amounts summed per currency. A currency with nothing recorded is absent rather than zero. */
export type CurrencyTotals = Partial<Record<Currency, number>>;

/** Adds `amountMinor` to one currency's running total in place. */
export function addToCurrencyTotal(
  totals: CurrencyTotals,
  currency: Currency,
  amountMinor: number,
): void {
  totals[currency] = (totals[currency] ?? 0) + amountMinor;
}

/** The currencies with a non-zero total other than `except`, in `currencies` order. */
export function otherCurrenciesWithAmounts(totals: CurrencyTotals, except: Currency): Currency[] {
  return currencies.filter((currency) => currency !== except && (totals[currency] ?? 0) !== 0);
}

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
  categoryIconEmoji?: string | null;
  /** The category's product key; absent on rows from older deployments and local-only storage. */
  categorySystemKey?: string | null;
  accountName: string;
}

/** Income the user earned: an opening balance is money already held, so it never counts. */
export function countsAsIncome(
  transaction: Pick<TransactionRecord, "kind" | "categorySystemKey">,
): boolean {
  return (
    transaction.kind === "income" &&
    transaction.categorySystemKey !== OPENING_BALANCE_CATEGORY_SYSTEM_KEY
  );
}

export interface TransactionListItem extends TransactionRecord {
  accountId: string | null;
  notes: string | null;
  /** The debt this payment was recorded against; null when no debt is linked. */
  debtId?: string | null;
  debtName?: string | null;
  /** Server `created_at`; ties same-date rows. Absent on rows built from local-only storage. */
  createdAt?: string;
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
  balancesByCurrency?: CurrencyTotals;
  archived: boolean;
  system?: boolean;
  interest?: InterestSettings;
  /** Names of active subscriptions paid from this account, so removing it can warn first. */
  activeSubscriptions?: string[];
}

export interface AccountBalanceSummaryItem {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balanceMinor: number;
  balancesByCurrency: CurrencyTotals;
  archived: boolean;
  system: boolean;
  interest?: InterestSettings;
  /** Names of active subscriptions paid from this account, so removing it can warn first. */
  activeSubscriptions?: string[];
}

export interface AccountBalanceSummary {
  currency: Currency;
  overallBalanceMinor: number;
  balancesByCurrency: CurrencyTotals;
  items: AccountBalanceSummaryItem[];
}

export const categoryOrigins = ["starter", "custom", "system"] as const;
export type CategoryOrigin = (typeof categoryOrigins)[number];

export const categoryRequiredPlans = ["free", "zoption_pro"] as const;
export type CategoryRequiredPlan = (typeof categoryRequiredPlans)[number];

/**
 * The product-owned category that marks money leaving an account as a debt payment.
 * Behavior keys off this value rather than the category name, so renaming a workspace's
 * copy never silently disables the feature.
 */
export const DEBT_PAYMENT_CATEGORY_SYSTEM_KEY = "debt:expense";

/**
 * The product-owned, archived income category that holds a workspace's opening cash balance. The
 * amount adds to the account balance but is money the user already had, so income figures skip it.
 */
export const OPENING_BALANCE_CATEGORY_SYSTEM_KEY = "opening:income";

export interface CategoryRecord {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  iconEmoji?: string | null;
  archived: boolean;
  system: boolean;
  /** Set on categories the product owns; absent on rows from older deployments. */
  systemKey?: string | null;
  origin: CategoryOrigin;
  requiredPlan: CategoryRequiredPlan;
  locked: boolean;
}

export const subscriptionBillingCycles = ["monthly", "yearly"] as const;
export type SubscriptionBillingCycle = (typeof subscriptionBillingCycles)[number];

export const subscriptionStatuses = ["active", "canceled"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const subscriptionRenewalReasons = ["insufficient_balance", "account_archived"] as const;
export type SubscriptionRenewalReason = (typeof subscriptionRenewalReasons)[number];

export interface SubscriptionRecord {
  id: string;
  name: string;
  amountMinor: number;
  currency: Currency;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  /** Set while the current cycle is not being charged, with the reason it is held back. */
  renewalBlockedReason?: SubscriptionRenewalReason | null;
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
  /**
   * The workspace currency. `totalMonthlyCostMinor` counts only active subscriptions billed in
   * it; each item carries its own currency, so a caller totals any other currency from the items.
   */
  currency: Currency;
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
  currency: Currency;
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
  currency: Currency;
  accountBalances?: AccountBalanceSummary;
  metrics: {
    moneyInMinor: number;
    moneyOutMinor: number;
    netMinor: number;
    incomeByCurrency: CurrencyTotals;
    expenseByCurrency: CurrencyTotals;
    budgetLimitMinor: number;
    remainingBudgetMinor: number;
    budgetUsedPercent: number;
  };
  spendingByCategory: Array<{
    categoryId: string;
    name: string;
    color: string;
    iconEmoji?: string | null;
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
  feesByCurrency: CurrencyTotals;
}

export interface TransferFeeInsight {
  /** True when at least one fee-charged transfer has been recorded. */
  hasFees: boolean;
  /** All-time number of transfers (each transfer counts once). */
  totalTransfers: number;
  /** All-time number of transfers that carried a fee. */
  totalFeeChargedTransfers: number;
  /** All-time transfer fees paid, per currency. */
  feesByCurrency: CurrencyTotals;
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

export const billingProviders = ["paypal", "dodo"] as const;
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
/** Metered monthly allowances. `ai_usage` is the single pool every billable AI request draws on. */
export const billingFeatures = ["ai_usage", "file_import"] as const;
export type BillingFeature = (typeof billingFeatures)[number];
export type BillingResource = "custom_category";
export type BillingCapability =
  | BillingFeature
  | "category_management"
  | "account_management"
  | "cashflow_analytics"
  | "transaction_export";

export const billingUsagePeriodKinds = ["calendar_month"] as const;
export type BillingUsagePeriodKind = (typeof billingUsagePeriodKinds)[number];

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

export const proEntitlementSources = ["paypal", "dodo", "platform_admin", "sponsored"] as const;
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
  /** Set on turns that help the user log a transaction, so a short reply continues that flow. */
  transactionEntry?: boolean;
  transactionDraft?: AssistantTransactionDraft;
}

export const CURRENT_ASSISTANT_CONSENT_VERSION = 7;
export const CURRENT_ASSISTANT_VOICE_CONSENT_VERSION = 4;

export const assistantSpeechVoices = ["default", "bright", "energetic"] as const;
export type AssistantSpeechVoice = (typeof assistantSpeechVoices)[number];

export const assistantThreadKinds = ["text", "voice"] as const;
export type AssistantThreadKind = (typeof assistantThreadKinds)[number];

export type AssistantDebtStrategy = "avalanche" | "snowball";
export type AssistantMemoryKind = "preference" | "fact" | "summary";
export type AssistantMemorySource = "user_stated" | "deterministic" | "model_assisted";

export interface AssistantMemory {
  id: string;
  kind: AssistantMemoryKind;
  key: string;
  value: string;
  source: AssistantMemorySource;
  threadId?: string | null;
  threadTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Aliases the API folds into `debt_strategy` when it canonicalizes memory keys on write, so
 * rows stored earlier can still reach clients under these keys. They all mean the payoff
 * preference, which the memory panel's strategy control owns; the `debt_rule` aliases
 * (`pay_smallest_first`, `smallest_debt_first`) are absent on purpose because those are real
 * rules. Keep in step with KEY_ALIASES in apps/api/src/assistant/memory.ts.
 */
export const assistantPayoffPreferenceKeys: ReadonlySet<string> = new Set([
  "debt_strategy",
  "avalanche_method",
  "snowball_method",
]);

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

export type VoiceLanguage = "auto" | "en" | "fil";

/**
 * Folds a value read at a boundary into the voice language the product supports.
 * "tl" is accepted as the older Tagalog alias, and anything unrecognised means Auto,
 * which lets the transcription provider detect the spoken language itself.
 */
export function parseVoiceLanguage(value: unknown): VoiceLanguage {
  if (value === "en" || value === "fil") return value;
  if (value === "tl") return "fil";
  return "auto";
}

export interface AssistantVoicePreferences {
  enabled: boolean;
  speechAvailable: boolean;
  reviewRequired: boolean;
  consentedAt: string | null;
  consentVersion: number;
  transcriptionModel: string;
  ttsModel: string;
}

export interface AssistantVoiceTranscription {
  text: string;
  durationSeconds: number;
  languageCode?: string;
}

export const providerServices = ["assistant", "stt", "tts"] as const;
export type ProviderService = (typeof providerServices)[number];

export const assistantProviders = [
  "deepseek",
  "openai",
  "anthropic",
  "gemini",
  "meta",
  "muse_spark",
] as const;
export type AssistantProviderName = (typeof assistantProviders)[number];

export const sttProviders = ["cloudflare_workers_ai", "google"] as const;
export type SttProviderName = (typeof sttProviders)[number];

export const ttsProviders = ["fish_audio"] as const;
export type TtsProviderName = (typeof ttsProviders)[number];

export type ProviderName = AssistantProviderName | SttProviderName | TtsProviderName;

/**
 * The assistant model used when no active configuration can be read. DeepSeek's `deepseek-flash`
 * is a moving alias for its current Flash release, so a new Flash version needs no change here.
 * Admins switch models at runtime from the AI & Voice Models page; this is only the fallback.
 */
export const DEFAULT_ASSISTANT_PROVIDER = "deepseek";
export const DEFAULT_ASSISTANT_MODEL = "deepseek-flash";

export const providerAllowlist: Record<ProviderService, Record<string, readonly string[]>> = {
  assistant: {
    deepseek: [DEFAULT_ASSISTANT_MODEL] as const,
    openai: ["gpt-4o-mini", "gpt-4o"] as const,
    anthropic: ["claude-3-5-haiku-latest", "claude-sonnet-4-20250514"] as const,
    gemini: [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
    ] as const,
    meta: ["Llama-4-Maverick-17B-128E-Instruct-FP8", "Llama-3.3-70B-Instruct"] as const,
    muse_spark: ["muse-spark-1.1"] as const,
  },
  stt: {
    cloudflare_workers_ai: ["@cf/openai/whisper-large-v3-turbo"] as const,
    google: [
      "gemini-3.5-transcribe",
      "gemini-3.5-transcribe-live",
      "gemini-2.0-flash",
      "chirp_3",
    ] as const,
  },
  tts: { fish_audio: ["s2.1-pro-free"] as const },
} as const;

export interface ProviderConfig {
  id: string;
  service: ProviderService;
  provider: string;
  model: string;
  displayName: string;
  credentialId: string | null;
  enabled: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ProviderCredential {
  id: string;
  provider: string;
  name: string;
  apiKeyLast4: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ProviderCredentialWithUsage extends ProviderCredential {
  usedBy: Array<{
    configId: string;
    service: ProviderService;
    provider: string;
    model: string;
    displayName: string;
    isActive: boolean;
  }>;
}

export interface ProviderConfigAudit {
  id: string;
  configId: string | null;
  service: ProviderService;
  action: "create" | "update" | "activate" | "deactivate" | "delete" | "reorder";
  oldValue: ProviderConfig | null;
  newValue: ProviderConfig | null;
  changedBy: string;
  createdAt: string;
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
  currency: Currency;
  kind: TransactionKind;
  categoryName?: string;
}

export interface ReceiptDraft {
  merchant: string;
  date: string;
  amountMinor: number;
  currency: Currency;
  kind: TransactionKind;
  categoryName?: string;
  /** Omitted by earlier API deployments; an empty list means no line could be read confidently. */
  items?: ReceiptLineItem[];
  rawText: string;
}

export interface AssistantThread {
  id: string;
  title: string;
  kind: AssistantThreadKind;
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
