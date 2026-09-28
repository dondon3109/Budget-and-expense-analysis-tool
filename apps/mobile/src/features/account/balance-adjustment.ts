// One-click "Adjust Current Balance": books the Old→New delta as an
// Uncategorized Adjustment transaction through the existing transaction
// mutation path, and undoes it by deleting exactly that entry. The delta math
// and transaction shape are shared with web.

export {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  formatAdjustmentPreview,
  parseAmountToMinor,
  resolveAdjustmentCategoryId,
} from "@zoption/shared";

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
