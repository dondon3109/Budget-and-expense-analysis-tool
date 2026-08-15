import type { BillingSummary } from "@zoption/shared";

import {
  allowanceCopy,
  manilaDate,
  pendingCheckoutCopy,
  periodEndsCopy,
  planName,
  planStatusCopy,
  usageResetsCopy,
  usageTitle,
} from "./billing-copy";

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: "zoption_pro",
    entitlementSource: "paypal",
    provider: "paypal",
    status: "active",
    interval: "month",
    currentPeriodEndsAt: "2026-06-01T00:00:00.000Z",
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: false,
    canManageBilling: true,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 1,
    usages: [
      {
        feature: "assistant_question",
        used: 12,
        limit: 100,
        periodKind: "anchored_14_day",
        periodStartedAt: "2026-05-18T00:00:00.000Z",
        resetsAt: "2026-06-01T00:00:00.000Z",
      },
      {
        feature: "file_import",
        used: 3,
        limit: 10,
        periodKind: "calendar_month",
        periodStartedAt: "2026-05-01T00:00:00.000Z",
        resetsAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    allowances: [{ resource: "custom_category", used: 2, limit: 3 }],
    ...overrides,
  };
}

describe("billing copy helpers", () => {
  it("names plans and statuses", () => {
    expect(planName(summary())).toBe("Zoption Pro");
    expect(planName(summary({ plan: "free" }))).toBe("Free plan");
    expect(planName(null)).toBe("Free plan");
    expect(planStatusCopy(summary({ status: "past_due" }))).toBe("Payment issue");
    expect(planStatusCopy(summary({ plan: "free" }))).toBe(null);
  });

  it("describes renewal state", () => {
    expect(periodEndsCopy(summary())).toMatch(/Renews on /);
    expect(periodEndsCopy(summary({ cancelAtPeriodEnd: true }))).toMatch(/Renewal is off/);
    expect(periodEndsCopy(summary({ plan: "free" }))).toBe(null);
  });

  it("titles usages per feature and period", () => {
    const usages = summary().usages;
    const questions = usages[0]!;
    const imports = usages[1]!;
    expect(usageTitle(questions)).toBe("AI questions this 14-day cycle");
    expect(usageTitle(imports)).toBe("Committed imports this month");
    expect(usageResetsCopy(questions)).toMatch(/^Resets /);
  });

  it("describes custom category allowances", () => {
    expect(allowanceCopy({ resource: "custom_category", used: 2, limit: 3 })).toBe(
      "2 of 3 custom categories",
    );
    expect(allowanceCopy({ resource: "custom_category", used: 5, limit: null })).toBe(
      "5 active custom categories (unlimited)",
    );
  });

  it("formats Manila dates and pending checkouts", () => {
    expect(manilaDate("2026-06-01T00:00:00.000Z")).toMatch(/2026/);
    expect(manilaDate("not-a-date")).toBe("not-a-date");
    expect(
      pendingCheckoutCopy(
        summary({
          pendingCheckout: {
            provider: "paypal",
            interval: "year",
            createdAt: "2026-05-01T00:00:00.000Z",
            expiresAt: "2026-05-02T00:00:00.000Z",
          },
        }),
      ),
    ).toMatch(/year checkout is awaiting payment approval/);
    expect(pendingCheckoutCopy(summary())).toBe(null);
  });
});
