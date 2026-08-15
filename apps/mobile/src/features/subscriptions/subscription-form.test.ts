import {
  billingCycleLabels,
  formatMinorForInput,
  parseSubscriptionForm,
  type SubscriptionFormValues,
} from "./subscription-form";

function validValues(): SubscriptionFormValues {
  return {
    name: "Netflix",
    amount: "549.00",
    billingCycle: "monthly",
    nextBillingDate: "2026-09-01",
    categoryId: "category-1",
    accountId: "account-1",
  };
}

describe("subscription form", () => {
  it("parses a valid subscription into minor-unit input", () => {
    const result = parseSubscriptionForm(validValues());
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input).toEqual({
      name: "Netflix",
      amountMinor: 54_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      categoryId: "category-1",
      accountId: "account-1",
    });
  });

  it("trims the subscription name", () => {
    const result = parseSubscriptionForm({ ...validValues(), name: "  Netflix  " });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.name).toBe("Netflix");
  });

  it("rejects an empty name", () => {
    const result = parseSubscriptionForm({ ...validValues(), name: "   " });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.name).toBe("string");
  });

  it("rejects a zero amount", () => {
    const result = parseSubscriptionForm({ ...validValues(), amount: "0.00" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.amount).toBe("string");
  });

  it("rejects an invalid next billing date", () => {
    const result = parseSubscriptionForm({ ...validValues(), nextBillingDate: "2026-02-30" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.nextBillingDate).toBe("string");
  });

  it("requires a category and an account", () => {
    const result = parseSubscriptionForm({ ...validValues(), categoryId: "", accountId: "" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.categoryId).toBe("string");
    expect(typeof result.errors.accountId).toBe("string");
  });

  it("formats minor units for input", () => {
    expect(formatMinorForInput(54_900)).toBe("549.00");
    expect(formatMinorForInput(0)).toBe("0.00");
  });

  it("labels every billing cycle", () => {
    expect(Object.keys(billingCycleLabels)).toHaveLength(2);
    expect(billingCycleLabels.yearly).toBe("Yearly");
  });
});
