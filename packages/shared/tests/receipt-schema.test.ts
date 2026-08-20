import { describe, expect, it } from "vitest";

import {
  receiptConsentUpdateSchema,
  receiptDraftSchema,
  transactionVoiceDraftSchema,
} from "../src/schemas";

describe("receiptDraftSchema", () => {
  it("accepts a fully parsed receipt draft", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "PHP",
      kind: "expense",
      categoryName: "Dining",
      items: [
        { description: "Chickenjoy", amountMinor: 18500, categoryName: "Dining" },
        { description: "Peach mango pie", amountMinor: 6500, categoryName: "Dining" },
      ],
      rawText: "JOLLIBEE * 250.00",
    });
    expect(result.success).toBe(true);
  });

  it("allows a draft without a category", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "PHP",
      kind: "expense",
      rawText: "JOLLIBEE * 250.00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero amount", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 0,
      currency: "PHP",
      kind: "expense",
      rawText: "JOLLIBEE * 0.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects currencies other than PHP", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "USD",
      kind: "expense",
      rawText: "JOLLIBEE * 250.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero-value or oversized receipt line items", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "PHP",
      kind: "expense",
      items: [{ description: "Chickenjoy", amountMinor: 0 }],
      rawText: "JOLLIBEE * 250.00",
    });
    expect(result.success).toBe(false);
  });
});

describe("receiptConsentUpdateSchema", () => {
  it("accepts an explicit consent", () => {
    const result = receiptConsentUpdateSchema.safeParse({ consented: true });
    expect(result.success).toBe(true);
  });

  it("rejects an explicit opt-out", () => {
    const result = receiptConsentUpdateSchema.safeParse({ consented: false });
    expect(result.success).toBe(false);
  });
});

describe("transactionVoiceDraftSchema", () => {
  it("accepts a review-only PHP draft", () => {
    expect(
      transactionVoiceDraftSchema.parse({
        transcript: "Spent 250 pesos on lunch today",
        description: "Lunch",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP",
        kind: "expense",
        categoryName: "Food",
      }),
    ).toMatchObject({ description: "Lunch", amountMinor: 25_000 });
  });

  it("rejects a zero amount before the form can be filled", () => {
    expect(
      transactionVoiceDraftSchema.safeParse({
        transcript: "Spent nothing",
        description: "Nothing",
        date: "2026-08-20",
        amountMinor: 0,
        currency: "PHP",
        kind: "expense",
      }).success,
    ).toBe(false);
  });
});
