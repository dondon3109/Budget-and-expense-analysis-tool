import {
  subscriptionRoi,
  type AssistantToolResultEnvelope,
  type Currency,
  type Debt,
  type FinancialGoal,
  type SubscriptionMonthItem,
  type SubscriptionMonthSummary,
  type SubscriptionUsageList,
} from "@zoption/shared";

import type { DataQualityAssessment } from "./data-quality";
import { shiftDays } from "./calendar-math";
import { formatMoney, source } from "./record-format";

const DEFAULT_DUE_WITHIN_DAYS = 30;

export interface SubscriptionsReadInput {
  through: string;
  dueWithinDays?: number;
}

/**
 * The user's saved subscriptions, the monthly cost of the active ones, and what bills in the
 * next few days. Totals count only the workspace currency, like the Subscriptions page, so a
 * plan billed in another currency is listed but never added in. `usage` is the Pro check-in log,
 * or null on other plans; a subscription then carries no usage field.
 */
export function subscriptionsResult(
  summary: SubscriptionMonthSummary,
  input: SubscriptionsReadInput,
  usage: SubscriptionUsageList | null = null,
): AssistantToolResultEnvelope<unknown> {
  const usedOnById = new Map(usage?.usage.map((row) => [row.subscriptionId, row.usedOn]));
  const days = input.dueWithinDays ?? DEFAULT_DUE_WITHIN_DAYS;
  const until = shiftDays(input.through, days);
  const currency = summary.currency;
  const dueSoon = summary.items
    .filter(
      (item) =>
        item.status === "active" &&
        item.nextBillingDate >= input.through &&
        item.nextBillingDate <= until,
    )
    .sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate));
  const otherCurrencyCount = summary.items.filter(
    (item) => item.status === "active" && item.currency !== currency,
  ).length;
  const quality: DataQualityAssessment = { status: "reliable", signals: [] };
  if (otherCurrencyCount > 0) {
    quality.status = "limited";
    quality.signals.push({
      code: "other_currency_excluded",
      message: `Totals count only ${currency}, the workspace currency; subscriptions billed in other currencies are listed but not added in or converted.`,
      count: otherCurrencyCount,
    });
  }
  return source(
    {
      currency,
      activeMonthlyCost: formatMoney(summary.totalMonthlyCostMinor, currency),
      activeCount: summary.items.filter((item) => item.status === "active").length,
      dueWindow: { from: input.through, to: until, days },
      dueSoonCount: dueSoon.length,
      dueSoonTotal: formatMoney(
        dueSoon
          .filter((item) => item.currency === currency)
          .reduce((total, item) => total + item.amountMinor, 0),
        currency,
      ),
      dueSoon: dueSoon.map((item) => ({
        name: item.name,
        amount: formatMoney(item.amountMinor, item.currency),
        nextBillingDate: item.nextBillingDate,
        accountName: item.accountName,
      })),
      items: summary.items.map((item) => ({
        name: item.name,
        amount: formatMoney(item.amountMinor, item.currency),
        billingCycle: item.billingCycle,
        monthlyCost: formatMoney(item.monthlyCostMinor, item.currency),
        nextBillingDate: item.nextBillingDate,
        status: item.status,
        categoryName: item.categoryName,
        accountName: item.accountName,
        ...(item.renewalBlockedReason ? { renewalOnHold: item.renewalBlockedReason } : {}),
        ...(usage
          ? { usage: usageSummary(item, usedOnById.get(item.id) ?? [], input.through) }
          : {}),
      })),
    },
    "subscriptions",
    { recordCount: summary.items.length, quality },
  );
}

/** Whole percent, rounded down, so a goal never reads as reached before it is. */
function progressPercent(currentMinor: number, targetMinor: number): string {
  if (targetMinor <= 0) return "100%";
  return `${Math.min(100, Math.floor((currentMinor * 100) / targetMinor))}%`;
}

/**
 * Saved goals with their progress and saved debts with their terms. Both carry no currency of
 * their own, so every amount is in the workspace currency.
 */
export function goalsAndDebtsResult(
  goals: readonly FinancialGoal[],
  debts: readonly Debt[],
  currency: Currency,
): AssistantToolResultEnvelope<unknown> {
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const activeDebts = debts.filter((debt) => debt.status === "active");
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  // No recordCount: clients caption it as "N goals", which would count debts as goals.
  return source(
    {
      currency,
      activeGoalCount: activeGoals.length,
      activeGoalsSaved: formatMoney(
        sum(activeGoals.map((goal) => goal.currentAmountMinor)),
        currency,
      ),
      activeGoalsTarget: formatMoney(
        sum(activeGoals.map((goal) => goal.targetAmountMinor)),
        currency,
      ),
      goals: goals.map((goal) => ({
        name: goal.name,
        status: goal.status,
        target: formatMoney(goal.targetAmountMinor, currency),
        saved: formatMoney(goal.currentAmountMinor, currency),
        remaining: formatMoney(
          Math.max(0, goal.targetAmountMinor - goal.currentAmountMinor),
          currency,
        ),
        progress: progressPercent(goal.currentAmountMinor, goal.targetAmountMinor),
        targetDate: goal.targetDate,
      })),
      activeDebtCount: activeDebts.length,
      activeDebtBalance: formatMoney(sum(activeDebts.map((debt) => debt.balanceMinor)), currency),
      activeMinimumPayments: formatMoney(
        sum(activeDebts.map((debt) => debt.minimumPaymentMinor)),
        currency,
      ),
      debts: debts.map((debt) => ({
        name: debt.name,
        type: debt.type,
        status: debt.status,
        balance: formatMoney(debt.balanceMinor, currency),
        apr: `${(debt.aprBasisPoints / 100).toFixed(2)}%`,
        minimumPayment: formatMoney(debt.minimumPaymentMinor, currency),
        balanceAsOf: debt.balanceAsOf,
      })),
    },
    "goals",
  );
}

function usageSummary(item: SubscriptionMonthItem, usedOn: readonly string[], today: string) {
  const roi = subscriptionRoi(item, usedOn, today);
  return {
    status: roi.status,
    lastUsedOn: roi.lastUsedOn,
    daysSinceLastUse: roi.daysSinceLastUse,
    usesThisCycle: roi.usesThisCycle,
    costPerUse:
      roi.costPerUseMinor === null ? null : formatMoney(roi.costPerUseMinor, item.currency),
  };
}
