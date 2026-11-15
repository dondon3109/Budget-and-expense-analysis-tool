import { describe, expect, it } from "vitest";

import {
  receiptConsentUpdateSchema,
  receiptDraftSchema,
  receiptPaymentSchema,
  transactionVoiceDraftSchema,
  type ReceiptPayment,
} from "../src/schemas";
import { receiptItemDescription, receiptPaymentKind, receiptPaymentNote } from "../src/receipts";

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

  it("rejects currencies Zoption does not support", () => {
    const result = receiptDraftSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "XAU",
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

describe("receiptItemDescription", () => {
  it("keeps the merchant as context for each receipt item", () => {
    expect(receiptItemDescription("Jollibee", "Chickenjoy")).toBe("Jollibee · Chickenjoy");
    expect(receiptItemDescription("Jollibee", "jollibee")).toBe("Jollibee");
    expect(receiptItemDescription(" ", "Chickenjoy")).toBe("Chickenjoy");
  });
});

describe("receipt payment details", () => {
  const gcash = {
    merchant: "JA•••N M•• L.",
    date: "2026-09-30",
    amountMinor: 240_000,
    currency: "PHP",
    kind: "expense",
    payment: {
      provider: "GCash",
      type: "send_money",
      counterparty: "JA•••N M•• L.",
      referenceNo: "2045596729825",
      feeMinor: 0,
    },
    rawText: "Sent via GCash",
  };

  it("accepts a draft with confirmation details", () => {
    expect(receiptDraftSchema.safeParse(gcash).success).toBe(true);
  });

  it("rejects an unknown payment type and a float exchange rate", () => {
    expect(
      receiptDraftSchema.safeParse({ ...gcash, payment: { provider: "GCash", type: "loan" } })
        .success,
    ).toBe(false);
    expect(
      receiptPaymentSchema.safeParse({ provider: "Wise", type: "remittance", exchangeRate: 56.12 })
        .success,
    ).toBe(false);
  });

  it("maps confirmation types to transaction kinds", () => {
    expect(receiptPaymentKind("receive_money")).toBe("income");
    expect(receiptPaymentKind("cash_in")).toBe("transfer");
    expect(receiptPaymentKind("bill_payment")).toBe("expense");
  });

  it("writes a searchable notes line", () => {
    expect(receiptPaymentNote(gcash.payment as ReceiptPayment)).toBe(
      "GCash Send money · Ref 2045596729825",
    );
    expect(
      receiptPaymentNote({
        provider: "Western Union",
        type: "remittance",
        sentAmountMinor: 50_000,
        sentCurrency: "USD",
        exchangeRate: "56.12",
      }),
    ).toBe("Western Union Remittance · Sent 500.00 USD at 56.12");
  });
});
