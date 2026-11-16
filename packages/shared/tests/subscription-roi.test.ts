import { describe, expect, it } from "vitest";

import {
  isSubscriptionUsageTracked,
  isUsageTrackedByDefault,
  previousSubscriptionBillingDate,
  subscriptionRoi,
} from "../src/subscriptions";

const gym = {
  amountMinor: 150_000,
  billingCycle: "monthly" as const,
  nextBillingDate: "2026-12-05",
};

describe("subscriptionRoi", () => {
  it("is untracked before the first check-in", () => {
    expect(subscriptionRoi(gym, [], "2026-11-16")).toEqual({
      status: "untracked",
      usedToday: false,
      lastUsedOn: null,
      daysSinceLastUse: null,
      usesThisCycle: 0,
      costPerUseMinor: null,
      weekStreak: 0,
    });
  });

  it("spreads the cycle's charge over the check-ins since the last billing date", () => {
    // The cycle began 2026-11-05; the 2026-11-01 visit belongs to the previous one.
    const roi = subscriptionRoi(
      gym,
      ["2026-11-01", "2026-11-06", "2026-11-10", "2026-11-16", "2026-11-16"],
      "2026-11-16",
    );
    expect(roi).toMatchObject({
      status: "active",
      usedToday: true,
      usesThisCycle: 3,
      costPerUseMinor: 50_000,
      daysSinceLastUse: 0,
    });
  });

  it("starts the cycle at a billing date that has passed but not rolled forward yet", () => {
    const overdue = { ...gym, nextBillingDate: "2026-11-04" };
    expect(subscriptionRoi(overdue, ["2026-10-07"], "2026-11-16").usesThisCycle).toBe(0);
    expect(subscriptionRoi(overdue, ["2026-11-05"], "2026-11-16").usesThisCycle).toBe(1);
  });

  it("turns idle after 30 days without a check-in", () => {
    expect(subscriptionRoi(gym, ["2026-10-17"], "2026-11-16")).toMatchObject({
      status: "idle",
      daysSinceLastUse: 30,
    });
    expect(subscriptionRoi(gym, ["2026-10-18"], "2026-11-16").status).toBe("active");
  });

  it("counts a weekly streak that survives until this week ends", () => {
    // 2026-11-16 is a Monday: last week and the two before each had a check-in.
    const days = ["2026-10-27", "2026-11-04", "2026-11-14"];
    expect(subscriptionRoi(gym, days, "2026-11-16").weekStreak).toBe(3);
    expect(subscriptionRoi(gym, [...days, "2026-11-16"], "2026-11-16").weekStreak).toBe(4);
    // A whole week without one breaks it.
    expect(subscriptionRoi(gym, ["2026-11-01"], "2026-11-16").weekStreak).toBe(0);
  });

  it("ignores check-ins after today", () => {
    expect(subscriptionRoi(gym, ["2026-11-17"], "2026-11-16").status).toBe("untracked");
  });
});

describe("previousSubscriptionBillingDate", () => {
  it("steps back one cycle and clamps to the month's last day", () => {
    expect(previousSubscriptionBillingDate("2026-03-31", "monthly")).toBe("2026-02-28");
    expect(previousSubscriptionBillingDate("2026-01-15", "monthly")).toBe("2025-12-15");
    expect(previousSubscriptionBillingDate("2028-02-29", "yearly")).toBe("2027-02-28");
  });
});

describe("isUsageTrackedByDefault", () => {
  it("starts services on and rent and utilities off", () => {
    for (const name of ["Netflix Standard", "ChatGPT Plus", "Spotify Premium", "Disney+", "Gym"]) {
      expect(isUsageTrackedByDefault(name), name).toBe(true);
    }
    for (const name of ["Electric bill", "Water", "Monthly rent", "Meralco", "Internet"]) {
      expect(isUsageTrackedByDefault(name), name).toBe(false);
    }
  });

  it("lets the person's choice win over the default", () => {
    expect(isSubscriptionUsageTracked("Monthly rent", true)).toBe(true);
    expect(isSubscriptionUsageTracked("Netflix", false)).toBe(false);
    expect(isSubscriptionUsageTracked("Netflix", undefined)).toBe(true);
  });
});
