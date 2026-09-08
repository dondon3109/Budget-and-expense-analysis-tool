import { describe, expect, it } from "vitest";

import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  formatAdjustmentPreview,
  formatMinorAmount,
  preferredTransactionAccount,
  resolveAdjustmentCategoryId,
} from "../src/transactions";

describe("transaction defaults", () => {
  const bank = { id: "bank", type: "checking" as const };
  const cash = { id: "cash", type: "cash" as const };

  it("prefers cash regardless of account order", () => {
    expect(preferredTransactionAccount([bank, cash])).toBe(cash);
  });

  it("falls back to the first available account when cash is unavailable", () => {
    expect(preferredTransactionAccount([bank])).toBe(bank);
    expect(preferredTransactionAccount([])).toBeUndefined();
  });
});

describe("balance adjustment helpers", () => {
  it("computes income delta when new balance is higher", () => {
    const preview = computeBalanceAdjustment(100_00, 150_00);
    expect(preview).toEqual({
      deltaMinor: 50_00,
      kind: "income",
      magnitudeMinor: 50_00,
    });
  });

  it("computes expense delta when new balance is lower", () => {
    const preview = computeBalanceAdjustment(150_00, 100_00);
    expect(preview).toEqual({
      deltaMinor: -50_00,
      kind: "expense",
      magnitudeMinor: 50_00,
    });
  });

  it("returns null kind when balances are identical", () => {
    const preview = computeBalanceAdjustment(100_00, 100_00);
    expect(preview).toEqual({
      deltaMinor: 0,
      kind: null,
      magnitudeMinor: 0,
    });
  });

  it("formats minor amount and adjustment preview cleanly", () => {
    expect(formatMinorAmount(12345)).toBe("123.45");
    expect(formatMinorAmount(50)).toBe("0.50");
    expect(formatMinorAmount(-500)).toBe("-5.00");
    expect(formatAdjustmentPreview(100_00, 150_50)).toBe("100.00 → 150.50");
  });

  it("resolves category preferring uncategorized or fallback", () => {
    const categories = [
      { id: "cat-groceries", name: "Groceries", kind: "expense" as const },
      { id: "cat-uncat", name: "Uncategorized", kind: "expense" as const },
      { id: "cat-salary", name: "Salary", kind: "income" as const },
    ];
    expect(resolveAdjustmentCategoryId(categories, "expense")).toBe("cat-uncat");
    expect(resolveAdjustmentCategoryId(categories, "income")).toBe("cat-salary");
    expect(resolveAdjustmentCategoryId([], "expense")).toBeNull();
  });

  it("builds balance adjustment transaction input", () => {
    const input = buildBalanceAdjustmentInput({
      accountId: "acc-1",
      accountName: "Cash",
      categoryId: "cat-uncat",
      currency: "PHP",
      currentBalanceMinor: 100_00,
      newBalanceMinor: 140_00,
      date: "2026-09-09",
    });
    expect(input).toEqual({
      kind: "income",
      accountId: "acc-1",
      categoryId: "cat-uncat",
      date: "2026-09-09",
      description: "Balance adjustment for Cash",
      amountMinor: 40_00,
      currency: "PHP",
      notes: "Adjusted from 100.00 to 140.00.",
    });

    const noChangeInput = buildBalanceAdjustmentInput({
      accountId: "acc-1",
      accountName: "Cash",
      categoryId: "cat-uncat",
      currency: "PHP",
      currentBalanceMinor: 100_00,
      newBalanceMinor: 100_00,
    });
    expect(noChangeInput).toBeNull();
  });
});
