import { describe, expect, it } from "vitest";

import { MoneyParseError, normalizeSignedAmount, parseAmountToMinor } from "../src/money";

describe("money normalization", () => {
  it("converts decimal text to integer minor units", () => {
    expect(parseAmountToMinor("1,234.50")).toBe(123450);
    expect(parseAmountToMinor("-42.7")).toBe(-4270);
    expect(parseAmountToMinor("0.05")).toBe(5);
  });

  it("rejects ambiguous or over-precise values", () => {
    expect(() => parseAmountToMinor("12.345")).toThrow(MoneyParseError);
    expect(() => parseAmountToMinor("PHP 20")).toThrow(MoneyParseError);
  });

  it("normalizes signs from the selected transaction kind", () => {
    expect(normalizeSignedAmount(-500, "income")).toBe(500);
    expect(normalizeSignedAmount(500, "expense")).toBe(-500);
  });
});
