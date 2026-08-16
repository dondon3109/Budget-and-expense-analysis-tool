import { describe, expect, it } from "vitest";

import { receiptScanRequestSchema, receiptScanResponseSchema } from "../src/schemas";

describe("receiptScanRequestSchema", () => {
  it("accepts a jpeg image payload", () => {
    const result = receiptScanRequestSchema.safeParse({
      imageBase64: "a".repeat(64),
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported mime types", () => {
    const result = receiptScanRequestSchema.safeParse({
      imageBase64: "a".repeat(64),
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty image payloads", () => {
    const result = receiptScanRequestSchema.safeParse({
      imageBase64: "abc",
      mimeType: "image/png",
    });
    expect(result.success).toBe(false);
  });
});

describe("receiptScanResponseSchema", () => {
  it("accepts a fully parsed receipt", () => {
    const result = receiptScanResponseSchema.safeParse({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 25_000,
      currency: "PHP",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null fields when nothing was readable", () => {
    const result = receiptScanResponseSchema.safeParse({
      merchant: null,
      date: null,
      amountMinor: null,
      currency: null,
    });
    expect(result.success).toBe(true);
  });
});
