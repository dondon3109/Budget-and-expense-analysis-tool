import type { BillingSummary } from "@zoption/shared";

import {
  allowanceCopy,
  manilaDate,
  pendingCheckoutCopy,
  periodEndsCopy,
  planName,
  planPriceLabel,
  planStatusCopy,
  usageResetsCopy,
  usageTitle,
} from "./billing-copy";

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: "zoption_pro",
    entitlementSource: "paypal",
    subscriptionPlan: "pro",
    provider: "paypal",
    status: "active",
    interval: "month",
    currentPeriodEndsAt: "2026-06-01T00:00:00.000Z",
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingChange: null,
    pendingCheckout: null,
    coveredBy: null,
    canCheckout: false,
    canChangePlan: true,
    canManageBilling: true,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 1,
    usages: [
      {
        feature: "ai_usage",
        used: 12,
        limit: 500,
        periodKind: "calendar_month",
        periodStartedAt: "2026-05-01T00:00:00.000Z",
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
    expect(planName(summary({ plan: "zoption_budget", subscriptionPlan: "budget" }))).toBe(
      "Zoption Budget",
    );
  });

  it("names the family that covers a member, and a downgrade waiting for the period end", () => {
    const covered = summary({
      plan: "zoption_budget",
      coveredBy: { familyId: "family-1", familyName: "Santos", plan: "family_budget" },
    });
    expect(planStatusCopy(covered)).toBe("Covered by Santos");
    expect(periodEndsCopy(covered)).toBe(
      "Family Budget gives you Zoption Budget. The family owner manages the plan.",
    );
    expect(
      periodEndsCopy(
        summary({
          pendingChange: {
            plan: "budget",
            interval: "month",
            effectiveAt: "2026-06-01T00:00:00.000Z",
          },
        }),
      ),
    ).toMatch(/^Moves to Zoption Budget on /);
  });

  it("prices a plan per interval in pesos", () => {
    expect(planPriceLabel("budget", "month")).toMatch(/149 \/ month$/);
    expect(planPriceLabel("family_pro", "year")).toMatch(/7,990 \/ year$/);
  });

  it("describes renewal state", () => {
    expect(periodEndsCopy(summary())).toMatch(/Renews on /);
    expect(periodEndsCopy(summary({ cancelAtPeriodEnd: true }))).toMatch(/Renewal is off/);
    expect(periodEndsCopy(summary({ plan: "free" }))).toBe(null);
    expect(
      periodEndsCopy(summary({ status: "trialing", entitlementSource: null, provider: null })),
    ).toMatch(/^Trial ends on /);
  });

  it("titles usages per feature", () => {
    const usages = summary().usages;
    const aiUsage = usages[0]!;
    const imports = usages[1]!;
    expect(usageTitle(aiUsage)).toBe("AI actions this month");
    expect(usageTitle(imports)).toBe("Committed imports this month");
    expect(usageResetsCopy(aiUsage)).toMatch(/^Resets /);
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
            plan: "budget",
            interval: "year",
            createdAt: "2026-05-01T00:00:00.000Z",
            expiresAt: "2026-05-02T00:00:00.000Z",
          },
        }),
      ),
    ).toMatch(/Zoption Budget checkout is awaiting payment approval/);
    expect(pendingCheckoutCopy(summary())).toBe(null);
  });
});
