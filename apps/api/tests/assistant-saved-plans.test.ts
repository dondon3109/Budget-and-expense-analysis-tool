import type { Debt, FinancialGoal, SubscriptionMonthSummary } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { goalsAndDebtsResult, subscriptionsResult } from "../src/assistant/saved-plans";
import { createAssistantTurnPolicy } from "../src/assistant/turn-policy";

function subscription(
  name: string,
  amountMinor: number,
  nextBillingDate: string,
  overrides: Partial<SubscriptionMonthSummary["items"][number]> = {},
): SubscriptionMonthSummary["items"][number] {
  return {
    id: name,
    name,
    amountMinor,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate,
    status: "active",
    categoryId: "c",
    categoryName: "Subscriptions",
    categoryColor: "#000",
    accountId: null,
    accountName: "GCash",
    billingDate: nextBillingDate,
    monthlyCostMinor: amountMinor,
    ...overrides,
  };
}

describe("subscriptionsResult", () => {
  it("lists active bills due in the window and totals only the workspace currency", () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-10-01",
      currency: "PHP",
      totalMonthlyCostMinor: 104_800,
      items: [
        subscription("Spotify", 19_900, "2026-10-30"),
        subscription("Netflix", 54_900, "2026-10-25"),
        subscription("Gym", 30_000, "2026-12-01"),
        subscription("Old app", 9_900, "2026-10-26", { status: "canceled" }),
        subscription("iCloud", 99, "2026-10-28", { currency: "USD" }),
      ],
    };

    const result = subscriptionsResult(summary, { through: "2026-10-23", dueWithinDays: 7 });
    const data = result.data as {
      dueSoon: { name: string }[];
      dueSoonTotal: string;
      activeMonthlyCost: string;
      dueWindow: { to: string };
    };

    expect(data.dueWindow.to).toBe("2026-10-30");
    expect(data.dueSoon.map((item) => item.name)).toEqual(["Netflix", "iCloud", "Spotify"]);
    expect(data.dueSoonTotal).toBe("PHP 748.00");
    expect(data.activeMonthlyCost).toBe("PHP 1,048.00");
    expect(result.dataQuality.signals.map((signal) => signal.code)).toEqual([
      "other_currency_excluded",
    ]);
  });

  it("reports usage only for bills with Track usage on", () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-10-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [
        subscription("Netflix", 54_900, "2026-11-05"),
        subscription("Electric bill", 300_000, "2026-11-05"),
        subscription("Spotify", 19_900, "2026-11-05"),
      ],
    };
    const result = subscriptionsResult(
      summary,
      { through: "2026-10-23" },
      {
        usage: [
          { subscriptionId: "Netflix", usedOn: ["2026-10-20"] },
          { subscriptionId: "Spotify", usedOn: ["2026-10-20"] },
        ],
        tracking: [{ subscriptionId: "Spotify", tracked: false }],
      },
    );
    const items = (result.data as { items: { name: string; usage: { status: string } }[] }).items;
    expect(items.map((item) => [item.name, item.usage.status])).toEqual([
      ["Netflix", "active"],
      ["Electric bill", "untracked"],
      ["Spotify", "untracked"],
    ]);
  });
});

describe("goalsAndDebtsResult", () => {
  const goal = (overrides: Partial<FinancialGoal>): FinancialGoal => ({
    id: "g",
    name: "Emergency fund",
    targetAmountMinor: 3_000_000,
    currentAmountMinor: 1_999_900,
    targetDate: "2027-06-30",
    status: "active",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  });
  const debt: Debt = {
    id: "d",
    name: "Visa",
    type: "credit_card",
    balanceMinor: 4_500_000,
    aprBasisPoints: 2_450,
    minimumPaymentMinor: 150_000,
    balanceAsOf: "2026-10-01",
    status: "active",
    createdAt: "",
    updatedAt: "",
  };

  it("rounds progress down and never reports a negative remainder", () => {
    const result = goalsAndDebtsResult(
      [goal({}), goal({ name: "Trip", targetAmountMinor: 100, currentAmountMinor: 500 })],
      [debt],
      "PHP",
    );
    const data = result.data as {
      goals: { name: string; progress: string; remaining: string }[];
      debts: { apr: string }[];
      activeDebtBalance: string;
    };

    expect(data.goals[0]).toMatchObject({ progress: "66%", remaining: "PHP 10,001.00" });
    expect(data.goals[1]).toMatchObject({ progress: "100%", remaining: "PHP 0.00" });
    expect(data.debts[0]!.apr).toBe("24.50%");
    expect(data.activeDebtBalance).toBe("PHP 45,000.00");
  });
});

describe("saved-plan turn policy", () => {
  function groups(message: string) {
    return createAssistantTurnPolicy({
      history: [],
      message,
      currentDate: "2026-10-23",
      timeZone: "Asia/Manila",
      transactionBounds: null,
    }).requiredToolGroups;
  }

  it.each(["What bills are due this week?", "Magkano ang subscriptions ko?"])(
    "reads saved subscriptions for %s",
    (message) => {
      expect(groups(message)).toContain("subscription_list");
    },
  );

  it.each(["How are my goals going?", "Kumusta ang utang ko?"])(
    "reads saved goals and debts for %s",
    (message) => {
      expect(groups(message)).toContain("goals_overview");
    },
  );
});
