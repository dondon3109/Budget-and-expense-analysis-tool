import type {
  AccountRecord,
  AccountType,
  BudgetRecord,
  CategoryRequiredPlan,
  Currency,
  DebtStatus,
  DebtType,
  FinancialGoalStatus,
  InterestSettings,
  SubscriptionBillingCycle,
  SubscriptionStatus,
  TransactionInput,
  TransactionKind,
  TransactionListItem,
  TransactionRecord,
} from "@zoption/shared";

// Shapes the local workspace repository returns to screens and hooks. The repository decodes
// SQLite rows with its own zod schemas and maps them into these; screens import only this file.
// Enum fields use the shared `as const` types, and repository.ts checks each schema against its
// view model, so a new enum value cannot slip past the typecheck.

/** A local row's synchronization state, stored in its `sync_state` column. */
export type LocalSyncState = "synced" | "pending" | "failed" | "conflicted";

export interface LocalWorkspaceStats {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

export interface LocalTransactionItem {
  transaction: TransactionListItem;
  syncState: LocalSyncState;
}

export interface LocalAccountOption {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  pending: boolean;
}

export interface LocalCategoryOption {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  /** Resolved for display: the stored emoji, or a default for well-known category names. */
  iconEmoji: string | null;
  pending: boolean;
}

export interface EditableLocalTransaction {
  id: string;
  input: TransactionInput;
  syncState: LocalSyncState;
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
  syncState: LocalSyncState;
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
  status: FinancialGoalStatus;
  syncState: LocalSyncState;
}

export interface LocalSubscriptionItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  categoryId: string | null;
  accountId: string | null;
  syncState: LocalSyncState;
}

export interface LocalEventItem {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  syncState: LocalSyncState;
}

export interface LocalAccountModeling {
  currency: Currency;
  balanceMinor: number;
  interest: InterestSettings;
}

export interface LocalCalendarDay {
  date: string;
  transactions: {
    id: string;
    description: string;
    amountMinor: number;
    kind: TransactionKind;
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
  type: DebtType;
  balanceMinor: number;
  aprBasisPoints: number;
  minimumPaymentMinor: number;
  balanceAsOf: string;
  status: DebtStatus;
  syncState: LocalSyncState;
}

export interface LocalAccountItem {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  system: boolean;
  serverRevision: number;
  syncState: LocalSyncState;
}

export interface LocalCategoryItem {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  iconEmoji?: string | null;
  system: boolean;
  requiredPlan: CategoryRequiredPlan;
  locked: boolean;
  serverRevision: number;
  syncState: LocalSyncState;
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
