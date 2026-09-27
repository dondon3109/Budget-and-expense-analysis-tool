import { describe, expect, it } from "vitest";

import { BUDGET_AND_SUBSCRIPTION_MAX_MINOR, GOAL_AND_DEBT_MAX_MINOR } from "../src/limits";
import { budgetLimitMinorSchema, debtInputSchema, debtUpdateSchema } from "../src/schemas/planning";
import { subscriptionInputSchema } from "../src/schemas/subscriptions";
import {
  mobileSyncBudgetSnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
} from "../src/sync";

const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: number) =>
  schema.safeParse(value).success;

describe("money limits", () => {
  it("keeps the REST and sync caps on the same values", () => {
    const budgetOrSubscription = [
      budgetLimitMinorSchema,
      mobileSyncBudgetSnapshotSchema.shape.limitMinor,
      mobileSyncSubscriptionSnapshotSchema.shape.amountMinor,
      subscriptionInputSchema.shape.amountMinor,
    ];
    for (const field of budgetOrSubscription) {
      expect(accepts(field, BUDGET_AND_SUBSCRIPTION_MAX_MINOR)).toBe(true);
      expect(accepts(field, BUDGET_AND_SUBSCRIPTION_MAX_MINOR + 1)).toBe(false);
    }

    const goalOrDebt = [
      mobileSyncGoalSnapshotSchema.shape.targetAmountMinor,
      mobileSyncDebtSnapshotSchema.shape.balanceMinor,
      debtInputSchema.shape.balanceMinor,
      debtInputSchema.shape.minimumPaymentMinor,
    ];
    for (const field of goalOrDebt) {
      expect(accepts(field, GOAL_AND_DEBT_MAX_MINOR)).toBe(true);
      expect(accepts(field, GOAL_AND_DEBT_MAX_MINOR + 1)).toBe(false);
    }
  });

  it("requires a positive balance to create a debt but allows a paid-off one afterwards", () => {
    // Deliberate: a new debt needs something owed, while an update or a synced snapshot can
    // record the balance reaching zero.
    expect(accepts(debtInputSchema.shape.balanceMinor, 0)).toBe(false);
    expect(accepts(debtUpdateSchema.shape.balanceMinor, 0)).toBe(true);
    expect(accepts(mobileSyncDebtSnapshotSchema.shape.balanceMinor, 0)).toBe(true);
  });
});
