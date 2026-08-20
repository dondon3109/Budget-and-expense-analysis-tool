import { parseAmountToMinor, type ReceiptDraft } from "@zoption/shared";

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
  kind: "income" | "expense",
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
  kind: "income" | "expense",
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

/** Returns null while an item has an incomplete or invalid amount. */
export function reviewedItemsTotalMinor(items: ReceiptReviewItem[]): number | null {
  let total = 0;
  for (const item of items) {
    try {
      total += parseAmountToMinor(item.amount);
    } catch {
      return null;
    }
  }
  return total;
}

/** Keeps each ledger entry meaningful when several items share a receipt. */
export function receiptItemDescription(merchant: string, itemDescription: string): string {
  const merchantName = merchant.trim();
  const itemName = itemDescription.trim();
  if (!merchantName) return itemName;
  if (!itemName || itemName.toLocaleLowerCase("en") === merchantName.toLocaleLowerCase("en")) {
    return merchantName;
  }
  return `${merchantName} · ${itemName}`.slice(0, 240);
}
