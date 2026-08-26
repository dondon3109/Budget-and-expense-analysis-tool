import { describe, expect, it } from "vitest";

import { detectImportSubscriptionCandidates } from "../src/importSubscriptions";

function row(overrides: Partial<import("../src/types").ImportPreviewRow> = {}): import("../src/types").ImportPreviewRow {
  return {
    rowNumber: 1,
    status: "ready",
    date: "2026-05-15",
    description: "Netflix",
    amountMinor: -54900,
    kind: "expense",
    categoryId: "cat-ent",
    categoryName: "Entertainment",
    categoryIsUncategorized: false,
    errors: [],
    ...overrides,
  } as import("../src/types").ImportPreviewRow;
}

describe("detectImportSubscriptionCandidates", () => {
  it("detects monthly recurring across 3 months with high confidence", () => {
    const rows = [
      row({ date: "2026-05-15", description: "Netflix" }),
      row({ date: "2026-06-15", description: "Netflix" }),
      row({ date: "2026-07-15", description: " Netflix " }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      description: "Netflix",
      occurrenceCount: 3,
      distinctMonths: 3,
      typicalAmountMinor: 54900,
      billingCycle: "monthly",
      cadence: "monthly",
      confidence: "high",
      nextBillingDate: "2026-08-15",
    });
  });

  it("detects with 2 occurrences across 2 months as medium confidence", () => {
    const rows = [
      row({ date: "2026-06-01", description: "Spotify", amountMinor: -13900 }),
      row({ date: "2026-07-01", description: "Spotify", amountMinor: -13900 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe("medium");
    expect(result[0]?.billingCycle).toBe("monthly");
  });

  it("handles yearly billing", () => {
    const rows = [
      row({ date: "2025-07-10", description: "Annual Service", amountMinor: -120000 }),
      row({ date: "2026-07-10", description: "Annual Service", amountMinor: -120000 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0]?.billingCycle).toBe("yearly");
    expect(result[0]?.nextBillingDate).toBe("2027-07-10");
  });

  it("ignores wildly varying amounts", () => {
    const rows = [
      row({ date: "2026-05-01", description: "Amazon", amountMinor: -1000 }),
      row({ date: "2026-06-01", description: "Amazon", amountMinor: -10000 }),
      row({ date: "2026-07-01", description: "Amazon", amountMinor: -50000 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(0);
  });

  it("allows moderate price hike within 30% for medium confidence", () => {
    const rows = [
      row({ date: "2026-05-15", description: "Canva Pro", amountMinor: -10000 }),
      row({ date: "2026-06-15", description: "Canva Pro", amountMinor: -10000 }),
      row({ date: "2026-07-15", description: "Canva Pro", amountMinor: -12000 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0]?.priceChangePercent).toBe(20);
    expect(result[0]?.highestAmountMinor).toBe(12000);
  });

  it("enforces distinct months or 3 occurrences", () => {
    const rows = [
      row({ date: "2026-07-01", description: "OneMonth Twice", amountMinor: -5000 }),
      row({ date: "2026-07-15", description: "OneMonth Twice", amountMinor: -5000 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    // 2 occurrences in same month should be ignored
    expect(result).toHaveLength(0);
  });

  it("normalizes description case and whitespace", () => {
    const rows = [
      row({ date: "2026-05-01", description: "  NETFLIX  " }),
      row({ date: "2026-06-01", description: "netflix" }),
      row({ date: "2026-07-01", description: "Netflix" }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(1);
    expect(result[0]?.normalized).toBe("netflix");
  });

  it("only considers ready expense rows", () => {
    const rows = [
      row({ date: "2026-05-01", description: "Netflix", status: "invalid" as any }),
      row({ date: "2026-06-01", description: "Netflix", kind: "income" as any }),
      row({ date: "2026-07-01", description: "Netflix" }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result).toHaveLength(0);
  });

  it("detects multiple merchants", () => {
    const rows = [
      row({ date: "2026-05-15", description: "Netflix" }),
      row({ date: "2026-06-15", description: "Netflix" }),
      row({ date: "2026-05-20", description: "Spotify", amountMinor: -13900 }),
      row({ date: "2026-06-20", description: "Spotify", amountMinor: -13900 }),
    ];
    const result = detectImportSubscriptionCandidates(rows);
    expect(result.map((r) => r.description).sort()).toEqual(["Netflix", "Spotify"]);
  });
});
