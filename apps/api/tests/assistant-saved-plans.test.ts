import type {
  AccountRecord,
  BudgetPlan,
  Debt,
  FinancialGoal,
  SubscriptionMonthSummary,
} from "@zoption/shared";
import { describe, expect, it } from "vitest";

import {
  goalsAndDebtsResult,
  safeToSpendResult,
  subscriptionsResult,
} from "../src/assistant/saved-plans";
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

  it.each([
    "What is my safe to spend?",
    "Why is my safe to spend zero?",
    "How much is safe to spend right now?",
    "Magkano ang safe to spend ko?",
  ])("reads safe to spend without requiring a reporting period for %s", (message) => {
    const policy = createAssistantTurnPolicy({
      history: [],
      message,
      currentDate: "2026-10-23",
      timeZone: "Asia/Manila",
      transactionBounds: null,
    });
    expect(policy.requiredToolGroups).toEqual(["safe_to_spend"]);
    expect(policy.deterministicResponse).toBeUndefined();
  });

  it.each([
    "How does safe to spend work?",
    "What is safe to spend?",
    "Paano gumagana ang safe to spend?",
  ])("answers general safe-to-spend explanations without calling a tool for %s", (message) => {
    const policy = createAssistantTurnPolicy({
      history: [],
      message,
      currentDate: "2026-10-23",
      timeZone: "Asia/Manila",
      transactionBounds: null,
    });
    expect(policy.requiredToolGroups).toEqual([]);
    expect(policy.deterministicResponse).toBeUndefined();
  });
});

describe("safeToSpendResult", () => {
  const account = (balanceMinor: number): AccountRecord => ({
    id: "acc-1",
    name: "Cash",
    type: "cash",
    currency: "PHP",
    balanceMinor,
    archived: false,
  });

  const budgetPlan = (limitMinor: number, spentMinor: number): BudgetPlan => ({
    scope: "month",
    month: "2026-08-01",
    eventId: null,
    title: null,
    date: null,
    currency: "PHP",
    totalLimitMinor: limitMinor,
    totalSpentMinor: spentMinor,
    remainingMinor: limitMinor - spentMinor,
    usedPercent: limitMinor === 0 ? 0 : Math.round((spentMinor / limitMinor) * 100),
    items:
      limitMinor > 0
        ? [
            {
              categoryId: "cat-1",
              categoryName: "Food",
              categoryColor: "#000",
              limitMinor,
              spentMinor,
              remainingMinor: limitMinor - spentMinor,
              usedPercent: Math.round((spentMinor / limitMinor) * 100),
              source: "month",
            },
          ]
        : [],
  });

  const subs = (items: SubscriptionMonthSummary["items"]): SubscriptionMonthSummary => ({
    month: "2026-08-01",
    currency: "PHP",
    totalMonthlyCostMinor: 0,
    items,
  });

  it("paces the remaining monthly budget across days left in the week and caps by 30-day bills", () => {
    // 2026-08-19 is Wednesday (5 days left in Monday-start week).
    // PHP 5,000 remaining / 5 days = PHP 1,000, capped to PHP 700 by a PHP 800 bill against PHP 1,500 balance.
    const result = safeToSpendResult({
      through: "2026-08-19",
      currency: "PHP",
      accountItems: [account(150_000)],
      budgetPlan: budgetPlan(700_000, 200_000),
      subscriptionSummary: subs([
        subscription("Cloud", 80_000, "2026-08-21"),
        subscription("iCloud", 99, "2026-08-22", { currency: "USD" }),
      ]),
    });

    expect(result.data).toMatchObject({
      date: "2026-08-19",
      daysLeftInWeek: 5,
      basis: "monthly_budget",
      safeToSpend: "PHP 700.00",
      remainingMonthlyBudget: "PHP 5,000.00",
      rawPaceBeforeBills: "PHP 1,000.00",
      cappedByUpcomingBills: true,
      upcomingBills30DaysTotal: "PHP 800.00",
      minProjectedBalance30Days: "PHP 700.00",
      minProjectedBalanceDate: "2026-08-21",
      alert: null,
    });
    expect(result.dataQuality.signals.map((signal) => signal.code)).toEqual([
      "other_currency_excluded",
    ]);
  });

  it("falls back to balance when no budgets are set and flags deficit risk from upcoming bills", () => {
    const result = safeToSpendResult({
      through: "2026-08-19",
      currency: "PHP",
      accountItems: [account(50_000)],
      budgetPlan: budgetPlan(0, 0),
      subscriptionSummary: subs([subscription("Cloud", 80_000, "2026-08-21")]),
    });

    expect(result.data).toMatchObject({
      basis: "account_balance",
      remainingMonthlyBudget: null,
      safeToSpend: "PHP 0.00",
      cappedByUpcomingBills: true,
      alert: { kind: "deficit_risk", deficitDate: "2026-08-21" },
    });
  });
});
