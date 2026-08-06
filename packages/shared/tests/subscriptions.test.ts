import { describe, expect, it } from "vitest";

import {
  monthlySubscriptionCost,
  subscriptionBillingDateForMonth,
  subscriptionInputSchema,
  subscriptionStatusUpdateSchema,
  subscriptionUpdateSchema,
} from "../src";

describe("subscription calculations", () => {
  it("normalizes monthly and yearly costs in integer minor units", () => {
    expect(monthlySubscriptionCost(1_299_00, "monthly")).toBe(1_299_00);
    expect(monthlySubscriptionCost(11_999, "yearly")).toBe(1_000);
  });

  it("projects monthly billing dates and clamps them to the final calendar day", () => {
    expect(subscriptionBillingDateForMonth("2026-01-31", "monthly", "2026-02-01")).toBe(
      "2026-02-28",
    );
    expect(subscriptionBillingDateForMonth("2028-01-31", "monthly", "2028-02-01")).toBe(
      "2028-02-29",
    );
  });

  it("only projects yearly billing in the renewal month", () => {
    expect(subscriptionBillingDateForMonth("2026-07-12", "yearly", "2027-07-01")).toBe(
      "2027-07-12",
    );
    expect(subscriptionBillingDateForMonth("2026-07-12", "yearly", "2027-08-01")).toBeNull();
  });
});

describe("subscription validation", () => {
  it("accepts the six create fields without a status", () => {
    expect(
      subscriptionInputSchema.parse({
        name: "Music streaming",
        amountMinor: 199_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "entertainment",
        accountId: "account-bank",
      }),
    ).toEqual({
      name: "Music streaming",
      amountMinor: 199_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "entertainment",
      accountId: "account-bank",
    });
  });

  it("rejects invalid amounts, dates, cycles, missing accounts, and statuses", () => {
    expect(
      subscriptionInputSchema.safeParse({
        name: "Invalid",
        amountMinor: 0,
        billingCycle: "weekly",
        nextBillingDate: "2026-02-30",
        categoryId: "expense",
        accountId: "account-bank",
      }).success,
    ).toBe(false);
    expect(
      subscriptionInputSchema.safeParse({
        name: "No account",
        amountMinor: 199_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "entertainment",
      }).success,
    ).toBe(false);
    expect(subscriptionStatusUpdateSchema.safeParse({ status: "paused" }).success).toBe(false);
  });

  it("accepts a full edit update matching the create fields", () => {
    const input = {
      name: "Music streaming Plus",
      amountMinor: 249_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-08-05",
      categoryId: "entertainment",
      accountId: "account-bank",
    };
    expect(subscriptionUpdateSchema.parse(input)).toEqual(input);
  });
});
