import { describe, expect, it } from "vitest";

import {
  accountBalanceUpdateSchema,
  assistantMessageInputSchema,
  assistantPeriodSummaryToolSchema,
} from "../src/schemas";

describe("assistant schemas", () => {
  it("requires balance snapshots to include both amount and date", () => {
    expect(
      accountBalanceUpdateSchema.safeParse({ balanceMinor: 10_000, balanceAsOf: null }).success,
    ).toBe(false);
    expect(
      accountBalanceUpdateSchema.safeParse({ balanceMinor: null, balanceAsOf: null }).success,
    ).toBe(true);
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
      assistantPeriodSummaryToolSchema.safeParse({
        from: "2026-08-01",
        to: "2026-07-01",
      }).success,
    ).toBe(false);
  });
});
