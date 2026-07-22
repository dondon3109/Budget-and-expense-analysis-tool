import { describe, expect, it } from "vitest";

import { importCommitSchema, importPreviewRequestSchema } from "../src/schemas";

const request = {
  fileName: "transactions.csv",
  csvText: "Description,Amount\nMarket,-50.00",
  mapping: {
    description: "Description",
    amount: "Amount",
  },
};

describe("import preview request schema", () => {
  it("accepts either a mapped date or one fallback date", () => {
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        mapping: { ...request.mapping, date: "Date" },
      }).success,
    ).toBe(true);
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        fallbackDate: "2026-07-21",
      }).success,
    ).toBe(true);
  });

  it("rejects requests with neither or both date sources", () => {
    expect(importPreviewRequestSchema.safeParse(request).success).toBe(false);
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        mapping: { ...request.mapping, date: "Date" },
        fallbackDate: "2026-07-21",
      }).success,
    ).toBe(false);
  });

  it("accepts one Amount column or a complete Debit and Credit pair", () => {
    expect(
      importPreviewRequestSchema.safeParse({ ...request, fallbackDate: "2026-07-21" }).success,
    ).toBe(true);
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        fallbackDate: "2026-07-21",
        mapping: {
          description: "Description",
          debit: "Withdrawal",
          credit: "Deposit",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects partial, conflicting, and duplicate amount mappings", () => {
    for (const mapping of [
      { description: "Description", debit: "Debit" },
      { description: "Description", credit: "Credit" },
      { description: "Description", amount: "Amount", debit: "Debit", credit: "Credit" },
      { description: "Amount", amount: "amount" },
    ]) {
      expect(
        importPreviewRequestSchema.safeParse({
          ...request,
          fallbackDate: "2026-07-21",
          mapping,
        }).success,
      ).toBe(false);
    }
  });

  it("keeps distinct punctuation-bearing source columns separate", () => {
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        fallbackDate: "2026-07-21",
        mapping: { description: "Amount (PHP)", amount: "Amount PHP" },
      }).success,
    ).toBe(true);
  });

  it("accepts a selected header row and an omitted category mapping", () => {
    const parsed = importPreviewRequestSchema.parse({
      ...request,
      headerRowNumber: 4,
      fallbackDate: "2026-07-21",
    });
    expect(parsed.headerRowNumber).toBe(4);
    expect(parsed.mapping.category).toBeUndefined();
  });

  it("rejects impossible fallback dates", () => {
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        fallbackDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
});

describe("import commit schema", () => {
  const token = "00000000-0000-4000-8000-000000000000";

  it("keeps token-only commits compatible", () => {
    expect(importCommitSchema.parse({ token })).toEqual({ token, categoryOverrides: [] });
  });

  it("accepts bounded unique category overrides", () => {
    expect(
      importCommitSchema.safeParse({
        token,
        categoryOverrides: [
          { rowNumber: 2, categoryId: "food" },
          { rowNumber: 5, categoryId: "salary" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate row overrides", () => {
    expect(
      importCommitSchema.safeParse({
        token,
        categoryOverrides: [
          { rowNumber: 2, categoryId: "food" },
          { rowNumber: 2, categoryId: "transport" },
        ],
      }).success,
    ).toBe(false);
  });
});
