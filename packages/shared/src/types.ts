export const transactionKinds = ["income", "expense", "transfer"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

export interface TransactionRecord {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: "PHP";
  kind: TransactionKind;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  accountName: string;
}

export interface TransactionListItem extends TransactionRecord {
  accountId: string | null;
  notes: string | null;
}

export interface TransactionPage {
  items: TransactionListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AccountRecord {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit" | "other";
  archived: boolean;
}

export interface CategoryRecord {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  archived: boolean;
}

export interface ImportMapping {
  date: string;
  description: string;
  amount: string;
  category: string;
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
  categoryName?: string;
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

export interface DashboardSummary {
  period: { from: string; to: string };
  currency: "PHP";
  metrics: {
    moneyInMinor: number;
    moneyOutMinor: number;
    netMinor: number;
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
