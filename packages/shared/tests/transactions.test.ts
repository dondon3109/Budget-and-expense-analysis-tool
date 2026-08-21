import { describe, expect, it } from "vitest";

import { preferredTransactionAccount } from "../src/transactions";

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
