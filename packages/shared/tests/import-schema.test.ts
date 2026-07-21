import { describe, expect, it } from "vitest";

import { importPreviewRequestSchema } from "../src/schemas";

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

  it("rejects impossible fallback dates and accepts an omitted category mapping", () => {
    expect(
      importPreviewRequestSchema.safeParse({
        ...request,
        fallbackDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      importPreviewRequestSchema.parse({
        ...request,
        fallbackDate: "2026-07-21",
      }).mapping.category,
    ).toBeUndefined();
  });
});
