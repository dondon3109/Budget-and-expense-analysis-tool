import { describe, expect, it } from "vitest";

import { projectCashflow } from "../src/cashflowForecast";
import { overspendingAlert, overspendingAlertMessage } from "../src/overspendingAlert";

const START = "2026-10-05";

function forecast(startingBalanceMinor: number, billAmountMinor = 0) {
  return projectCashflow({
    startingBalanceMinor,
    startDate: START,
    horizonDays: 30,
    subscriptions:
      billAmountMinor > 0
        ? [
            {
              name: "Rent",
              amountMinor: billAmountMinor,
              billingCycle: "monthly",
              nextBillingDate: "2026-10-15",
            },
          ]
        : [],
  });
}

describe("overspendingAlert", () => {
  it("raises nothing while there is still something safe to spend and no deficit", () => {
    expect(overspendingAlert({ safeToSpendMinor: 10_000, forecast: forecast(500_000) })).toBe(null);
  });

  it("flags a spent-out week when safe to spend reaches zero", () => {
    expect(overspendingAlert({ safeToSpendMinor: 0, forecast: forecast(500_000) })).toEqual({
      kind: "overspent",
    });
  });

  it("names the first day the forecast goes below zero, over a spent-out week", () => {
    expect(
      overspendingAlert({ safeToSpendMinor: 0, forecast: forecast(100_000, 150_000) }),
    ).toEqual({ kind: "deficit_risk", deficitDate: "2026-10-15" });
  });
});

describe("overspendingAlertMessage", () => {
  it("puts the deficit date in the body", () => {
    expect(
      overspendingAlertMessage({ kind: "deficit_risk", deficitDate: "2026-10-15" }).body,
    ).toContain("2026-10-15");
  });
});
