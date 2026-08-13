import { formatMinorForInput, localCalendarDate, parseTransactionForm } from "./transaction-form";

describe("native transaction form", () => {
  const valid = {
    kind: "expense" as const,
    accountId: "account-1",
    categoryId: "category-1",
    date: "2026-08-13",
    description: "Lunch",
    amount: "1,234.50",
    currency: "PHP" as const,
    notes: "",
  };

  it("converts decimal input to integer minor units without floating-point rounding", () => {
    expect(parseTransactionForm(valid)).toEqual({
      success: true,
      input: {
        kind: "expense",
        accountId: "account-1",
        categoryId: "category-1",
        date: "2026-08-13",
        description: "Lunch",
        amountMinor: 123_450,
        currency: "PHP",
        notes: undefined,
      },
    });
    expect(formatMinorForInput(-123_450)).toBe("1234.50");
  });

  it("rejects zero, excessive precision, and impossible calendar dates", () => {
    const zero = parseTransactionForm({ ...valid, amount: "0" });
    const precision = parseTransactionForm({ ...valid, amount: "1.999" });
    const date = parseTransactionForm({ ...valid, date: "2026-02-30" });
    expect(zero.success).toBe(false);
    expect(precision.success).toBe(false);
    expect(date.success).toBe(false);
    if (zero.success || precision.success || date.success)
      throw new Error("Expected invalid forms.");
    expect(typeof zero.errors.amount).toBe("string");
    expect(typeof precision.errors.amount).toBe("string");
    expect(typeof date.errors.date).toBe("string");
  });

  it("uses the device calendar date without converting through UTC", () => {
    expect(localCalendarDate(new Date(2026, 7, 13, 23, 59))).toBe("2026-08-13");
  });
});
