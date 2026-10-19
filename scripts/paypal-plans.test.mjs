import { describe, expect, it } from "vitest";

import { PLAN_PRICES_MINOR } from "../packages/shared/src/plans";
import { PAYPAL_PLANS } from "./paypal-plans.mjs";

describe("PayPal plan catalog", () => {
  it("charges what the app shows for every plan and interval", () => {
    const variable = (plan, interval) =>
      `PAYPAL_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}_PLAN_ID`;
    const expected = Object.entries(PLAN_PRICES_MINOR).flatMap(([plan, prices]) =>
      Object.entries(prices).map(([interval, minor]) => [
        variable(plan, interval),
        `${minor / 100}`,
      ]),
    );

    expect(PAYPAL_PLANS.map((entry) => [entry.variable, entry.fixedPrice]).sort()).toEqual(
      expected.sort(),
    );
  });
});
