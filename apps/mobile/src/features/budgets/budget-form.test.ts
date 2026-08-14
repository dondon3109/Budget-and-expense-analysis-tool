import { currentMonthStart, parseBudgetForm, shiftMonth } from "./budget-form";

describe("parseBudgetForm", () => {
  it("parses a valid peso amount into minor units", () => {
    expect(parseBudgetForm({ categoryId: "category-1", amount: "1,250.50" })).toEqual({
      success: true,
      limitMinor: 125_050,
    });
  });

  it("accepts zero as a removal amount", () => {
    expect(parseBudgetForm({ categoryId: "category-1", amount: "0" })).toEqual({
      success: true,
      limitMinor: 0,
    });
  });

  it("rejects negative and malformed amounts", () => {
    const negative = parseBudgetForm({ categoryId: "category-1", amount: "-10" });
    expect(negative.success).toBe(false);
    if (negative.success) throw new Error("Expected a validation failure.");
    expect(typeof negative.errors.amount).toBe("string");

    const malformed = parseBudgetForm({ categoryId: "category-1", amount: "abc" });
    expect(malformed.success).toBe(false);
    if (malformed.success) throw new Error("Expected a validation failure.");
    expect(typeof malformed.errors.amount).toBe("string");
  });

  it("requires an expense category", () => {
    const result = parseBudgetForm({ categoryId: "", amount: "10" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected a validation failure.");
    expect(typeof result.errors.categoryId).toBe("string");
  });
});

describe("month helpers", () => {
  it("shifts and labels months", () => {
    expect(shiftMonth("2026-08-01", -1)).toBe("2026-07-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("derives the current month start deterministically", () => {
    expect(currentMonthStart(new Date(2026, 7, 14))).toBe("2026-08-01");
  });
});
