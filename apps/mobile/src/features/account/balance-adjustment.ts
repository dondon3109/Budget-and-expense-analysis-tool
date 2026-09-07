import {
  parseAmountToMinor,
  type TransactionInput,
} from "@zoption/shared";

import { formatMinorForInput, localCalendarDate } from "@/features/transactions/transaction-form";

// One-click "Adjust Current Balance": books the Old→New delta as an
// Uncategorized Adjustment transaction through the existing transaction
// mutation path, and undoes it by deleting exactly that entry.

export interface BalanceAdjustmentPreview {
  /** Signed delta in minor units: newBalanceMinor - currentBalanceMinor. */
  deltaMinor: number;
  /** Transaction kind that books the delta. Null when balances already match. */
  kind: "income" | "expense" | null;
  /** Absolute delta in minor units. */
  magnitudeMinor: number;
}

/** Pure delta math: a higher new balance is income, a lower one is expense. */
export function computeBalanceAdjustment(
  currentBalanceMinor: number,
  newBalanceMinor: number,
): BalanceAdjustmentPreview {
  const deltaMinor = newBalanceMinor - currentBalanceMinor;
  if (deltaMinor === 0) return { deltaMinor: 0, kind: null, magnitudeMinor: 0 };
  return {
    deltaMinor,
    kind: deltaMinor > 0 ? "income" : "expense",
    magnitudeMinor: Math.abs(deltaMinor),
  };
}

export function formatAdjustmentPreview(
  currentBalanceMinor: number,
  newBalanceMinor: number,
): string {
  return `${formatMinorForInput(currentBalanceMinor)} → ${formatMinorForInput(newBalanceMinor)}`;
}

export interface AdjustmentCategory {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
}

/**
 * Mirrors the receipt-review fallback so adjustments always land somewhere
 * sensible: suggested name, then "Uncategorized", then the first of its kind.
 */
export function resolveAdjustmentCategoryId(
  categories: readonly AdjustmentCategory[],
  kind: "income" | "expense",
): string | null {
  const usable = categories.filter((category) => category.kind === kind);
  return (
    usable.find((category) => category.name.toLocaleLowerCase("en") === "uncategorized")?.id ??
    usable[0]?.id ??
    null
  );
}

export interface BalanceAdjustmentInput {
  accountId: string;
  accountName: string;
  categoryId: string;
  currency: "PHP" | "USD";
  currentBalanceMinor: number;
  newBalanceMinor: number;
  date?: string;
}

/** Builds the Uncategorized Adjustment transaction for a nonzero delta. Null when there is nothing to book. */
export function buildBalanceAdjustmentInput(
  input: BalanceAdjustmentInput,
): TransactionInput | null {
  const preview = computeBalanceAdjustment(input.currentBalanceMinor, input.newBalanceMinor);
  if (preview.kind === null) return null;
  return {
    kind: preview.kind,
    accountId: input.accountId,
    categoryId: input.categoryId,
    date: input.date ?? localCalendarDate(),
    description: `Balance adjustment for ${input.accountName}`,
    amountMinor: preview.magnitudeMinor,
    currency: input.currency,
    notes: `Adjusted from ${formatMinorForInput(input.currentBalanceMinor)} to ${formatMinorForInput(input.newBalanceMinor)}.`,
  };
}

export interface AdjustmentMutationTarget {
  deleteTransaction: (id: string) => Promise<void>;
}

/**
 * Reverses an adjustment by deleting exactly that entry. Scoped to the
 * adjustment transaction id produced when the adjustment was booked.
 */
export async function undoBalanceAdjustment(
  mutations: AdjustmentMutationTarget,
  adjustmentId: string,
): Promise<void> {
  if (!adjustmentId.trim()) {
    throw new Error("There is no saved adjustment to undo.");
  }
  await mutations.deleteTransaction(adjustmentId);
}

export { parseAmountToMinor };
