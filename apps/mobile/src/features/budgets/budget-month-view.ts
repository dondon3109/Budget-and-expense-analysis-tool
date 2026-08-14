import type { LocalBudgetMonthData } from "@/db/repository";

export interface BudgetMonthRow {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usedPercent: number;
  overBudget: boolean;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface BudgetMonthView {
  rows: BudgetMonthRow[];
  totalLimitMinor: number;
  totalSpentMinor: number;
  totalRemainingMinor: number;
  totalUsedPercent: number;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildBudgetMonthView(data: LocalBudgetMonthData): BudgetMonthView {
  const rows: BudgetMonthRow[] = data.budgets
    .filter((budget) => budget.limitMinor > 0)
    .map((budget) => {
      const remainingMinor = budget.limitMinor - budget.spentMinor;
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.categoryName,
        categoryColor: budget.categoryColor,
        limitMinor: budget.limitMinor,
        spentMinor: budget.spentMinor,
        remainingMinor,
        usedPercent:
          budget.limitMinor === 0 ? 0 : roundPercent((budget.spentMinor / budget.limitMinor) * 100),
        overBudget: budget.spentMinor > budget.limitMinor,
        syncState: budget.syncState,
      };
    });
  const totalLimitMinor = rows.reduce((sum, row) => sum + row.limitMinor, 0);
  const totalSpentMinor = rows.reduce((sum, row) => sum + row.spentMinor, 0);
  return {
    rows,
    totalLimitMinor,
    totalSpentMinor,
    totalRemainingMinor: totalLimitMinor - totalSpentMinor,
    totalUsedPercent:
      totalLimitMinor === 0 ? 0 : roundPercent((totalSpentMinor / totalLimitMinor) * 100),
  };
}
