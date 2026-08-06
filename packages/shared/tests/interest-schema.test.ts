import { describe, expect, it } from "vitest";

import { interestUpdateSchema } from "../src/schemas";

describe("interestUpdateSchema", () => {
  it("accepts enabled monthly interest with a rate, frequency, and pay day", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 15,
    });
    expect(result.success).toBe(true);
  });

  it("accepts enabled daily interest without a pay day", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "daily",
      payDay: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts disabling interest, clearing the rate", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: false,
      annualRateBasisPoints: 0,
      frequency: "yearly",
      payDay: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an enabled interest with a zero annual rate", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 0,
      frequency: "monthly",
      payDay: 15,
    });
    expect(result.success).toBe(false);
  });

  it("rejects daily interest carrying a pay day", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "daily",
      payDay: 15,
    });
    expect(result.success).toBe(false);
  });

  it("rejects monthly/yearly interest without a pay day", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pay day out of range", () => {
    const result = interestUpdateSchema.safeParse({
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 32,
    });
    expect(result.success).toBe(false);
  });
});
