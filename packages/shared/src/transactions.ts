import type { TransactionInput } from "./schemas";
import type { AccountType } from "./types";

/** New entries prefer cash while preserving a usable fallback for workspaces without one. */
export function preferredTransactionAccount<Account extends { type: AccountType }>(
  accounts: readonly Account[],
): Account | undefined {
  return accounts.find((account) => account.type === "cash") ?? accounts[0];
}

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

export function formatMinorAmount(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const magnitude = Math.abs(amountMinor);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function formatAdjustmentPreview(
  currentBalanceMinor: number,
  newBalanceMinor: number,
): string {
  return `${formatMinorAmount(currentBalanceMinor)} → ${formatMinorAmount(newBalanceMinor)}`;
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
    date: input.date ?? new Date().toISOString().slice(0, 10),
    description: `Balance adjustment for ${input.accountName}`,
    amountMinor: preview.magnitudeMinor,
    currency: input.currency,
    notes: `Adjusted from ${formatMinorAmount(input.currentBalanceMinor)} to ${formatMinorAmount(input.newBalanceMinor)}.`,
  };
}
