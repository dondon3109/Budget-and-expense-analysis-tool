import type { CategoryRecord, ReceiptDraft } from "@zoption/shared";

import {
  receiptItemDescription,
  reviewedItemsTotalMinor,
  reviewItemsFromReceipt,
} from "./receipt-review";

const categories: CategoryRecord[] = [
  {
    id: "dining",
    name: "Dining",
    kind: "expense",
    color: "#0f6b5b",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized",
    name: "Uncategorized",
    kind: "expense",
    color: "#66706a",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
];

const draft: ReceiptDraft = {
  merchant: "Jollibee",
  date: "2026-08-20",
  amountMinor: 28_500,
  currency: "PHP",
  kind: "expense",
  items: [
    { description: "Chickenjoy", amountMinor: 18_500, categoryName: "Dining" },
    { description: "Peach mango pie", amountMinor: 10_000 },
  ],
  rawText: "JOLLIBEE 285.00",
};

describe("receipt review items", () => {
  it("keeps every extracted line and maps suggested categories when possible", () => {
    expect(reviewItemsFromReceipt(draft, categories, "expense")).toEqual([
      { id: "scanned-1", description: "Chickenjoy", amount: "185.00", categoryId: "dining" },
      {
        id: "scanned-2",
        description: "Peach mango pie",
        amount: "100.00",
        categoryId: "uncategorized",
      },
    ]);
  });

  it("falls back to one receipt total when an older server sends no items", () => {
    const oldDraft = { ...draft, items: undefined };
    expect(reviewItemsFromReceipt(oldDraft, categories, "expense")).toEqual([
      { id: "scanned-1", description: "Jollibee", amount: "285.00", categoryId: "uncategorized" },
    ]);
  });

  it("uses the receipt total when discounted itemization is intentionally omitted", () => {
    const discountedDraft = { ...draft, amountMinor: 24_500, items: [] };
    const items = reviewItemsFromReceipt(discountedDraft, categories, "expense");

    expect(items).toEqual([
      { id: "scanned-1", description: "Jollibee", amount: "245.00", categoryId: "uncategorized" },
    ]);
    expect(reviewedItemsTotalMinor(items)).toBe(24_500);
  });

  it("sums reviewed amounts and preserves merchant context in each transaction", () => {
    const items = reviewItemsFromReceipt(draft, categories, "expense");
    expect(reviewedItemsTotalMinor(items)).toBe(28_500);
    expect(receiptItemDescription("Jollibee", "Chickenjoy")).toBe("Jollibee · Chickenjoy");
    expect(receiptItemDescription("Jollibee", "Jollibee")).toBe("Jollibee");
  });
});
