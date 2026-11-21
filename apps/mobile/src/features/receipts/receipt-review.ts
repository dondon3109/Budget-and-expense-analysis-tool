import {
  parseAmountToMinor,
  preferredTransactionAccount,
  receiptPaymentNote,
  type AccountType,
  type ReceiptDraft,
} from "@zoption/shared";

import { formatMinorForInput } from "@/features/transactions/transaction-form";

export const MAX_RECEIPT_REVIEW_ITEMS = 30;

export interface ReceiptReviewItem {
  id: string;
  description: string;
  amount: string;
  categoryId: string;
}

export interface ReceiptReviewCategory {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
}

function categoryIdFor(
  categories: ReceiptReviewCategory[],
  kind: ReceiptReviewCategory["kind"],
  suggestedName?: string,
): string {
  const usable = categories.filter((category) => category.kind === kind);
  const normalizedSuggestion = suggestedName?.trim().toLocaleLowerCase("en");
  return (
    usable.find((category) => category.name.toLocaleLowerCase("en") === normalizedSuggestion)?.id ??
    usable.find((category) => category.name.toLocaleLowerCase("en") === "uncategorized")?.id ??
    usable[0]?.id ??
    ""
  );
}

/** Turns every recognized receipt line into an independently editable local transaction draft. */
export function reviewItemsFromReceipt(
  draft: ReceiptDraft,
  categories: ReceiptReviewCategory[],
  kind: ReceiptReviewCategory["kind"],
): ReceiptReviewItem[] {
  const extracted = draft.items?.length
    ? draft.items
    : [
        {
          description: draft.merchant,
          amountMinor: Math.abs(draft.amountMinor),
          categoryName: draft.categoryName,
        },
      ];
  return extracted.slice(0, MAX_RECEIPT_REVIEW_ITEMS).map((item, index) => ({
    id: `scanned-${index + 1}`,
    description: item.description,
    amount: formatMinorForInput(item.amountMinor),
    categoryId: categoryIdFor(categories, kind, item.categoryName ?? draft.categoryName),
  }));
}

/** Returns null when the input is incomplete, invalid, or not strictly positive. */
export function parsePositiveMinor(value: string): number | null {
  try {
    const amount = parseAmountToMinor(value);
    return amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

/** Returns null while any item has an incomplete, zero, negative, or invalid amount. */
export function reviewedItemsTotalMinor(items: ReceiptReviewItem[]): number | null {
  let total = 0;
  for (const item of items) {
    const amount = parsePositiveMinor(item.amount);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}

/**
 * Picks the from/to accounts for a scanned confirmation without colliding them. A cash-in
 * lands in the provider wallet (`toAccountId`), so if the default source account is that same
 * wallet, pick the counterparty/merchant account or another account as `fromAccountId`.
 */
export function resolveTransferAccounts<T extends { id: string; name: string; type: AccountType }>(
  accounts: readonly T[],
  currentFromId: string,
  lastUsedAccountId: string | null,
  draft: ReceiptDraft,
): { fromAccountId: string; toAccountId: string } {
  const providerAccount = accountForProvider(accounts, draft.payment?.provider);
  const toAccountId = providerAccount?.id ?? "";
  if (!toAccountId || currentFromId !== toAccountId) {
    return { fromAccountId: currentFromId, toAccountId };
  }
  const otherAccounts = accounts.filter((account) => account.id !== toAccountId);
  const sourceAccount =
    accountForProvider(otherAccounts, draft.payment?.counterparty ?? draft.merchant) ??
    preferredTransactionAccount(otherAccounts, lastUsedAccountId);
  return { fromAccountId: sourceAccount?.id ?? "", toAccountId };
}

/**
 * The account a wallet or bank confirmation belongs to, matched by name: a "GCash" account for a
 * GCash screenshot, "BPI Savings" for a BPI one. Short names never match, so "Maya" cannot pick a
 * "My savings" account by accident.
 */
export function accountForProvider<T extends { id: string; name: string }>(
  accounts: readonly T[],
  provider: string | undefined,
): T | undefined {
  const needle = provider?.trim().toLocaleLowerCase("en") ?? "";
  if (needle.length < 3) return undefined;
  return accounts.find((account) => account.name.toLocaleLowerCase("en").includes(needle));
}

/** Notes for every entry saved from one scan; a confirmation keeps its reference number. */
export function receiptNotes(draft: ReceiptDraft | null): string {
  if (!draft?.payment) return "Scanned receipt";
  return `Scanned receipt · ${receiptPaymentNote(draft.payment)}`.slice(0, 500);
}
