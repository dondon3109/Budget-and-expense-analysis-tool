import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  formatAdjustmentPreview,
  resolveAdjustmentCategoryId,
  undoBalanceAdjustment,
} from "./balance-adjustment";

describe("computeBalanceAdjustment", () => {
  it("books an increase as income with a positive delta", () => {
    expect(computeBalanceAdjustment(10000, 15000)).toEqual({
      deltaMinor: 5000,
      kind: "income",
      magnitudeMinor: 5000,
    });
  });

  it("books a decrease as expense with a negative delta", () => {
    expect(computeBalanceAdjustment(15000, 10000)).toEqual({
      deltaMinor: -5000,
      kind: "expense",
      magnitudeMinor: 5000,
    });
  });

  it("reports no booking direction when balances already match", () => {
    expect(computeBalanceAdjustment(7500, 7500)).toEqual({
      deltaMinor: 0,
      kind: null,
      magnitudeMinor: 0,
    });
  });

  it("previews Old → New values", () => {
    expect(formatAdjustmentPreview(10000, 15000)).toBe("100.00 → 150.00");
  });
});

describe("buildBalanceAdjustmentInput", () => {
  const base = {
    accountId: "account-1",
    accountName: "Cash",
    categoryId: "category-uncategorized",
    currency: "PHP" as const,
    currentBalanceMinor: 10000,
  };

  it("builds an income adjustment when the new balance is higher", () => {
    expect(buildBalanceAdjustmentInput({ ...base, newBalanceMinor: 12550 })).toMatchObject({
      kind: "income",
      accountId: "account-1",
      amountMinor: 2550,
      currency: "PHP",
    });
  });

  it("builds an expense adjustment when the new balance is lower", () => {
    expect(buildBalanceAdjustmentInput({ ...base, newBalanceMinor: 9000 })).toMatchObject({
      kind: "expense",
      amountMinor: 1000,
    });
  });

  it("returns null when there is nothing to adjust", () => {
    expect(buildBalanceAdjustmentInput({ ...base, newBalanceMinor: 10000 })).toBeNull();
  });
});

describe("resolveAdjustmentCategoryId", () => {
  const categories = [
    { id: "c-food", name: "Food", kind: "expense" as const },
    { id: "c-uncat", name: "Uncategorized", kind: "expense" as const },
  ];

  it("prefers Uncategorized, then the first of its kind", () => {
    expect(resolveAdjustmentCategoryId(categories, "expense")).toBe("c-uncat");
    expect(resolveAdjustmentCategoryId([categories[0]!], "expense")).toBe("c-food");
    expect(resolveAdjustmentCategoryId(categories, "income")).toBeNull();
  });
});

describe("undoBalanceAdjustment", () => {
  it("reverses exactly the booked adjustment entry", async () => {
    const deleted: string[] = [];
    await undoBalanceAdjustment(
      { deleteTransaction: async (id: string) => void deleted.push(id) },
      "adjustment-1",
    );
    expect(deleted).toEqual(["adjustment-1"]);
  });

  it("refuses to undo without a saved adjustment id", async () => {
    await expect(
      undoBalanceAdjustment({ deleteTransaction: async () => {} }, "  "),
    ).rejects.toThrow("There is no saved adjustment to undo.");
  });
});
