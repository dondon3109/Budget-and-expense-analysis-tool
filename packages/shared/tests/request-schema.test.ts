import { describe, expect, it } from "vitest";

import { categoryListQuerySchema, resourceIdSchema, transactionInputSchema } from "../src/schemas";

describe("API request boundary schemas", () => {
  it("accepts generated and deterministic application identifiers", () => {
    expect(resourceIdSchema.safeParse("00000000-0000-4000-8000-000000000000").success).toBe(true);
    expect(
      resourceIdSchema.safeParse("user:00000000-0000-4000-8000-000000000000:category:food").success,
    ).toBe(true);
  });

  it("rejects malformed or oversized application identifiers", () => {
    expect(resourceIdSchema.safeParse("../../tenant").success).toBe(false);
    expect(resourceIdSchema.safeParse("x".repeat(181)).success).toBe(false);
  });

  it("rejects unknown transaction ownership fields", () => {
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        description: "Groceries",
        amountMinor: 2_455,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
        accountId: "account-everyday",
        tenantId: "attacker-controlled",
      }).success,
    ).toBe(false);
  });

  it("accepts supported transaction currencies and rejects unknown ones", () => {
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        description: "Groceries",
        amountMinor: 2_455,
        currency: "USD",
        kind: "expense",
        categoryId: "food",
        accountId: "account-everyday",
      }).success,
    ).toBe(true);
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        description: "Groceries",
        amountMinor: 2_455,
        currency: "EUR",
        kind: "expense",
        categoryId: "food",
        accountId: "account-everyday",
      }).success,
    ).toBe(false);
  });

  it("parses only explicit category archive booleans", () => {
    expect(categoryListQuerySchema.parse({})).toEqual({ includeArchived: false });
    expect(categoryListQuerySchema.parse({ includeArchived: "true" })).toEqual({
      includeArchived: true,
    });
    expect(categoryListQuerySchema.safeParse({ includeArchived: "yes" }).success).toBe(false);
    expect(
      categoryListQuerySchema.safeParse({ includeArchived: "false", tenantId: "x" }).success,
    ).toBe(false);
  });

  it("accepts transfers without a description and with a transfer fee, and bounds the fee", () => {
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        amountMinor: 10_000,
        currency: "PHP",
        kind: "transfer",
        categoryId: "transfer",
        fromAccountId: "account-a",
        toAccountId: "account-b",
        transferFeeMinor: 1_000,
      }).success,
    ).toBe(true);
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        description: "",
        amountMinor: 10_000,
        currency: "PHP",
        kind: "transfer",
        categoryId: "transfer",
        fromAccountId: "account-a",
        toAccountId: "account-b",
      }).success,
    ).toBe(true);
    expect(
      transactionInputSchema.safeParse({
        date: "2026-07-18",
        description: "",
        amountMinor: 10_000,
        currency: "PHP",
        kind: "transfer",
        categoryId: "transfer",
        fromAccountId: "account-a",
        toAccountId: "account-b",
        transferFeeMinor: 10_000,
      }).success,
    ).toBe(false);
  });
});
