import { billingFeatures } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { billingMonthlyUsage } from "../../../db/schema";

/**
 * db/schema.ts cannot import the shared list (the repo root has no @zoption/shared dependency),
 * so this guard fails CI if its inline drizzle enum drifts from BillingFeature.
 */
describe("billing feature drift", () => {
  it("keeps the drizzle enum in step with the shared BillingFeature list", () => {
    expect(billingMonthlyUsage.feature.enumValues).toEqual([...billingFeatures]);
  });
});
