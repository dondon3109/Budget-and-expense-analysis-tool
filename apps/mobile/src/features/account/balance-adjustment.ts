// "Adjust current balance": books the Old→New delta as an Uncategorized
// Adjustment transaction through the existing transaction mutation path, and
// undoes it by deleting exactly that entry. The delta math and transaction
// shape are shared with web.

import {
  holdsMultipleCurrencies,
  parseAmountToMinor,
  type Currency,
  type CurrencyTotals,
} from "@zoption/shared";

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

/**
 * The account editor's pending balance change. "Save changes" books it, so changing a
 * balance takes the same single tap as any other edit.
 */
export interface BalanceDraft {
  /** True while the user opens a balance in a currency the account does not hold yet. */
  adding: boolean;
  newCurrency: Currency | null;
  amount: string;
}

export const emptyBalanceDraft: BalanceDraft = { adding: false, newCurrency: null, amount: "" };

/**
 * The currency a draft changes, its balance now, and the typed new balance: undefined
 * while the field is blank and null when the text is not a valid amount.
 */
export function resolveBalanceDraft({
  accountType,
  accountCurrency,
  balancesByCurrency,
  selectedCurrency,
  draft,
}: {
  accountType: string;
  accountCurrency: Currency;
  balancesByCurrency: CurrencyTotals;
  selectedCurrency?: Currency | null;
  draft: BalanceDraft;
}): { currency: Currency | null; currentBalanceMinor: number; newBalanceMinor?: number | null } {
  const currency = draft.adding
    ? draft.newCurrency
    : holdsMultipleCurrencies(accountType)
      ? (selectedCurrency ?? accountCurrency)
      : accountCurrency;
  const currentBalanceMinor = currency ? (balancesByCurrency[currency] ?? 0) : 0;
  if (!draft.amount.trim()) return { currency, currentBalanceMinor };
  try {
    return { currency, currentBalanceMinor, newBalanceMinor: parseAmountToMinor(draft.amount) };
  } catch {
    return { currency, currentBalanceMinor, newBalanceMinor: null };
  }
}
