import { describe, expect, it } from "vitest";

import {
  accountInputSchema,
  assistantMessageInputSchema,
  assistantPeriodSummaryToolSchema,
  transactionInputSchema,
} from "../src/schemas";

describe("account and assistant schemas", () => {
  it("validates custom account details", () => {
    expect(accountInputSchema.safeParse({ name: "My bank", type: "checking" }).success).toBe(true);
    expect(accountInputSchema.safeParse({ name: "", type: "checking" }).success).toBe(false);
  });

  it("requires both different accounts for transfers", () => {
    const base = {
      date: "2026-07-27",
      description: "Move savings",
      amountMinor: 10_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
    };
    expect(
      transactionInputSchema.safeParse({ ...base, fromAccountId: "cash", toAccountId: "bank" })
        .success,
    ).toBe(true);
    expect(
      transactionInputSchema.safeParse({ ...base, fromAccountId: "cash", toAccountId: "cash" })
        .success,
    ).toBe(false);
  });

  it("rejects client-controlled assistant context", () => {
    expect(
      assistantMessageInputSchema.safeParse({
        message: "How much did I spend?",
        clientRequestId: "41b850d2-d056-4df5-a9d8-ffca7f135e10",
        tenantId: "another-tenant",
        model: "another-model",
      }).success,
    ).toBe(false);
  });

  it("validates summary ranges before tool execution", () => {
    expect(
      assistantPeriodSummaryToolSchema.safeParse({ from: "2026-08-01", to: "2026-07-01" }).success,
    ).toBe(false);
  });
});
