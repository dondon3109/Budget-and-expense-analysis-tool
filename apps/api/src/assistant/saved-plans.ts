import {
  calculateSafeToSpend,
  forecastSubscriptions,
  getDaysLeftInWeek,
  hasSpendingBasis,
  isSubscriptionUsageTracked,
  overspendingAlert,
  projectCashflow,
  subscriptionRoi,
  summarizeAccountBalances,
  type AccountRecord,
  type AssistantToolResultEnvelope,
  type BudgetPlan,
  type Currency,
  type Debt,
  type FinancialGoal,
  type SubscriptionMonthItem,
  type SubscriptionMonthSummary,
  type SubscriptionUsageList,
} from "@zoption/shared";

import { readTier } from "../billing/entitlements";
import type { AccountRepository } from "../db/accounts";
import type { BudgetRepository } from "../db/budgets";
import type { DebtRepository } from "../db/debts";
import type { FinancialGoalRepository } from "../db/goals";
import type { SubscriptionUsageRepository } from "../db/subscription-usage";
import type { SubscriptionRepository } from "../db/subscriptions";
import type { Bindings } from "../types";
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
 * or null on other plans; a subscription then carries no usage field. A bill with "Track usage"
 * off (rent and utilities by default) reads as untracked, whatever its old check-ins say.
 */
export function subscriptionsResult(
  summary: SubscriptionMonthSummary,
  input: SubscriptionsReadInput,
  usage: SubscriptionUsageList | null = null,
): AssistantToolResultEnvelope<unknown> {
  const usedOnById = new Map(usage?.usage.map((row) => [row.subscriptionId, row.usedOn]));
  const trackedById = new Map(usage?.tracking.map((row) => [row.subscriptionId, row.tracked]));
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
          ? {
              usage: isSubscriptionUsageTracked(item.name, trackedById.get(item.id))
                ? usageSummary(item, usedOnById.get(item.id) ?? [], input.through)
                : { status: "untracked" },
            }
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

export interface SafeToSpendResultInput {
  through: string;
  currency: Currency;
  accountItems: readonly AccountRecord[];
  budgetPlan: BudgetPlan;
  subscriptionSummary: SubscriptionMonthSummary;
}

/**
 * Matches the web and mobile Safe to spend card: remaining monthly budget (or overall balance
 * when no budgets are set for the month), divided across the days left in the Monday-start week,
 * capped so active workspace-currency subscriptions renewing in the next 30 days cannot push the
 * projected balance below zero.
 */
export function safeToSpendResult({
  through,
  currency,
  accountItems,
  budgetPlan,
  subscriptionSummary,
}: SafeToSpendResultInput): AssistantToolResultEnvelope<unknown> {
  const startingBalanceMinor = summarizeAccountBalances(accountItems, currency).overallBalanceMinor;
  const hasBudget = budgetPlan.totalLimitMinor > 0;
  const remainingBudgetMinor = hasBudget ? budgetPlan.remainingMinor : undefined;
  const envelopeMinor = Math.max(0, remainingBudgetMinor ?? startingBalanceMinor);
  const [year = 1970, monthNum = 1, day = 1] = through.split("-").map(Number);
  // Build at local noon so getDay() reflects the trusted calendar date in any runtime timezone.
  const daysLeftInWeek = getDaysLeftInWeek(new Date(year, monthNum - 1, day, 12, 0, 0), "monday");
  const activeSubscriptions = forecastSubscriptions(subscriptionSummary.items, currency);
  const excludedSubscriptionCount = subscriptionSummary.items.filter(
    (item) => item.status === "active" && item.currency !== currency,
  ).length;
  const forecast = projectCashflow({
    startingBalanceMinor,
    subscriptions: activeSubscriptions,
    horizonDays: 30,
    startDate: through,
  });
  const calculation = calculateSafeToSpend({
    remainingWeeklyEnvelopeMinor: envelopeMinor,
    daysLeftInWeek,
    forecast: { minProjectedBalanceMinor: forecast.minProjectedBalanceMinor },
  });
  const hasBasis = hasSpendingBasis({ startingBalanceMinor, remainingBudgetMinor });
  const alert = overspendingAlert({
    safeToSpendMinor: calculation.safeToSpendMinor,
    forecast,
    hasBasis,
  });

  const quality: DataQualityAssessment = { status: "reliable", signals: [] };
  if (excludedSubscriptionCount > 0) {
    quality.status = "limited";
    quality.signals.push({
      code: "other_currency_excluded",
      message: `Safe to spend counts only active subscriptions billed in ${currency}, the workspace currency; subscriptions in other currencies are excluded.`,
      count: excludedSubscriptionCount,
    });
  }

  return source(
    {
      date: through,
      currency,
      safeToSpend: formatMoney(calculation.safeToSpendMinor, currency),
      daysLeftInWeek: calculation.daysLeftInWeek,
      basis: hasBudget ? "monthly_budget" : "account_balance",
      startingBalance: formatMoney(startingBalanceMinor, currency),
      remainingMonthlyBudget:
        remainingBudgetMinor === undefined ? null : formatMoney(remainingBudgetMinor, currency),
      rawPaceBeforeBills: formatMoney(calculation.rawDailyEnvelopeMinor, currency),
      cappedByUpcomingBills: calculation.isForecastCapped,
      upcomingBills30DaysTotal: formatMoney(forecast.totalBillsMinor, currency),
      minProjectedBalance30Days: formatMoney(forecast.minProjectedBalanceMinor, currency),
      minProjectedBalanceDate: forecast.minBalanceDate,
      hasSpendingBasis: hasBasis,
      alert: alert
        ? {
            kind: alert.kind,
            ...(alert.kind === "deficit_risk" ? { deficitDate: alert.deficitDate } : {}),
          }
        : null,
    },
    "budgets",
    { quality },
  );
}

export interface SavedPlanDeps {
  accounts: AccountRepository;
  budgets: BudgetRepository;
  debts: DebtRepository;
  goals: FinancialGoalRepository;
  subscriptions: SubscriptionRepository;
  subscriptionUsage: SubscriptionUsageRepository;
  workspaceCurrencyLoader: (env: Bindings, tenantId: string) => Promise<Currency>;
}

/** Loads the current month's subscriptions and Pro usage check-ins. */
export async function loadSubscriptions(
  deps: Pick<SavedPlanDeps, "subscriptions" | "subscriptionUsage">,
  context: { env: Bindings; tenantId: string },
  input: SubscriptionsReadInput,
): Promise<AssistantToolResultEnvelope<unknown>> {
  const month = `${input.through.slice(0, 7)}-01`;
  const isPro = (await readTier(context.env, context.tenantId)) === "zoption_pro";
  const [summary, usage] = await Promise.all([
    deps.subscriptions.list(context.env, context.tenantId, month),
    isPro ? deps.subscriptionUsage.list(context.env, context.tenantId, input.through) : null,
  ]);
  return subscriptionsResult(summary, input, usage);
}

/** Loads saved savings goals and debts in the workspace currency. */
export async function loadGoalsAndDebts(
  deps: Pick<SavedPlanDeps, "goals" | "debts" | "workspaceCurrencyLoader">,
  context: { env: Bindings; tenantId: string },
): Promise<AssistantToolResultEnvelope<unknown>> {
  const [goalItems, debtItems, currency] = await Promise.all([
    deps.goals.list(context.env, context.tenantId),
    deps.debts.list(context.env, context.tenantId),
    deps.workspaceCurrencyLoader(context.env, context.tenantId),
  ]);
  return goalsAndDebtsResult(goalItems, debtItems, currency);
}

/** Loads the current month's accounts, budget, and subscriptions to build safe-to-spend. */
export async function loadSafeToSpend(
  deps: Pick<SavedPlanDeps, "accounts" | "budgets" | "subscriptions" | "workspaceCurrencyLoader">,
  context: { env: Bindings; tenantId: string },
  through: string,
): Promise<AssistantToolResultEnvelope<unknown>> {
  const month = `${through.slice(0, 7)}-01`;
  const [accountItems, budgetPlan, subscriptionSummary, currency] = await Promise.all([
    deps.accounts.list(context.env, context.tenantId),
    deps.budgets.get(context.env, context.tenantId, { scope: "month", month }),
    deps.subscriptions.list(context.env, context.tenantId, month),
    deps.workspaceCurrencyLoader(context.env, context.tenantId),
  ]);
  return safeToSpendResult({ through, currency, accountItems, budgetPlan, subscriptionSummary });
}
