import type {
  AccountRecord,
  AccountType,
  BudgetRecord,
  InterestSettings,
  TransactionInput,
  TransactionListItem,
  TransactionRecord,
} from "@zoption/shared";

// Shapes the local workspace repository returns to screens and hooks. The repository decodes
// SQLite rows with its own zod schemas and maps them into these; screens import only this file.

export interface LocalWorkspaceStats {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

export interface LocalTransactionItem {
  transaction: TransactionListItem;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalAccountOption {
  id: string;
  name: string;
  type: AccountType;
  currency: "PHP" | "USD";
  pending: boolean;
}

export interface LocalCategoryOption {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  color: string;
  /** Resolved for display: the stored emoji, or a default for well-known category names. */
  iconEmoji: string | null;
  pending: boolean;
}

export interface EditableLocalTransaction {
  id: string;
  input: TransactionInput;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface TransactionFormData {
  accounts: LocalAccountOption[];
  categories: LocalCategoryOption[];
  transaction: EditableLocalTransaction | null;
  unavailableReason: string | null;
}

export interface BudgetMonthItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  limitMinor: number;
  spentMinor: number;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalBudgetMonthData {
  budgets: BudgetMonthItem[];
  categories: LocalCategoryOption[];
}

export interface LocalGoalItem {
  id: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  targetDate: string;
  status: "active" | "paused" | "completed";
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalSubscriptionItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  billingCycle: "monthly" | "yearly";
  nextBillingDate: string;
  status: "active" | "canceled";
  categoryId: string | null;
  accountId: string | null;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalEventItem {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalAccountModeling {
  currency: "PHP" | "USD";
  balanceMinor: number;
  interest: InterestSettings;
}

export interface LocalCalendarDay {
  date: string;
  transactions: {
    id: string;
    description: string;
    amountMinor: number;
    kind: "income" | "expense" | "transfer";
  }[];
  subscriptionBills: {
    id: string;
    name: string;
    amountMinor: number;
  }[];
  events: LocalEventItem[];
}

export interface LocalCalendarMonth {
  month: string;
  days: LocalCalendarDay[];
}

export interface LocalDebtItem {
  id: string;
  name: string;
  type: "credit_card" | "personal_loan" | "auto_loan" | "mortgage" | "other";
  balanceMinor: number;
  aprBasisPoints: number;
  minimumPaymentMinor: number;
  balanceAsOf: string;
  status: "active" | "paid";
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalAccountItem {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit" | "other";
  currency: "PHP" | "USD";
  system: boolean;
  serverRevision: number;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalCategoryItem {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  color: string;
  iconEmoji?: string | null;
  system: boolean;
  requiredPlan: "free" | "zoption_pro";
  locked: boolean;
  serverRevision: number;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface LocalReferenceData {
  accounts: LocalAccountItem[];
  categories: LocalCategoryItem[];
}

export interface LocalDashboardData {
  /** Transactions inside the dashboard window, newest first. */
  transactions: TransactionRecord[];
  /**
   * The newest transactions overall, for the recent activity card. Read
   * separately because that card must show the latest entries even when the
   * ledger has been dormant for longer than the dashboard window.
   */
  recentTransactions: TransactionRecord[];
  accounts: AccountRecord[];
  budgets: BudgetRecord[];
}

export const transactionKindFilters = ["all", "income", "expense", "transfer"] as const;
export type TransactionKindFilter = (typeof transactionKindFilters)[number];

export interface TransactionQuery {
  search?: string;
  kind?: TransactionKindFilter;
  accountId?: string;
  month?: string;
  limit?: number;
}
