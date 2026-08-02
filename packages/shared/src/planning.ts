import { parseAmountToMinor } from "./money";

export type DebtPayoffStrategy = "avalanche" | "snowball";

export interface DebtProjectionInput {
  id?: string;
  name: string;
  balanceMinor: number;
  aprBasisPoints: number;
  minimumPaymentMinor: number;
}

export interface DebtProjectionPayment {
  month: number;
  date: string;
  paymentMinor: number;
  interestMinor: number;
  remainingMinor: number;
}

export interface DebtProjectionResult {
  status: "paid_off" | "non_amortizing";
  strategy: DebtPayoffStrategy;
  payoffMonths: number | null;
  payoffDate: string | null;
  totalInterestMinor: number;
  totalPaidMinor: number;
  monthlyBudgetMinor: number;
  payoffOrder: string[];
  schedule: DebtProjectionPayment[];
  assumptions: string[];
}

export interface SavingsGoalProjectionResult {
  status: "met" | "due_now" | "on_track" | "past_due";
  targetAmountMinor: number;
  currentSavedMinor: number;
  remainingMinor: number;
  targetDate: string;
  contributionMonths: number;
  requiredMonthlyMinor: number | null;
  amountDueNowMinor: number;
  assumptions: string[];
}

export interface RecurringTransactionInput {
  date: string;
  description: string;
  categoryName: string;
  amountMinor: number;
}

export interface RecurringChargeResult {
  description: string;
  categoryName: string;
  occurrenceDates: string[];
  occurrenceCount: number;
  cadence: "monthly" | "irregular";
  typicalAmountMinor: number;
  latestAmountMinor: number;
  lowestAmountMinor: number;
  highestAmountMinor: number;
  priceChangeMinor: number;
  priceChangePercent: number | null;
  confidence: "high" | "medium";
}

export interface AnomalyTransactionInput extends RecurringTransactionInput {
  id: string;
}

export interface AnomalyBaselineWindow {
  from: string;
  to: string;
  transactions: AnomalyTransactionInput[];
}

export interface SpendingAnomalyResult {
  status: "reliable" | "insufficient";
  unusualTransactions: Array<{
    id: string;
    date: string;
    description: string;
    categoryName: string;
    amountMinor: number;
    baselineMedianMinor: number;
    reason: string;
  }>;
  categorySpikes: Array<{
    categoryName: string;
    requestedTotalMinor: number;
    baselineMedianMinor: number;
    reason: string;
  }>;
  limitations: string[];
}

const MAX_DEBT_PROJECTION_MONTHS = 600;
const MIN_ANOMALY_BASELINE_COUNT = 5;
const MIN_CATEGORY_BASELINE_WINDOWS = 3;

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftMonths(value: string, months: number): string {
  const date = dateFromIso(`${value.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatIsoDate(date);
}

function monthDifference(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function medianAbsoluteDeviation(values: readonly number[], center: number): number {
  return median(values.map((value) => Math.abs(value - center)));
}

function roundPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function debtSort(strategy: DebtPayoffStrategy) {
  return (a: DebtProjectionInput, b: DebtProjectionInput): number =>
    strategy === "avalanche"
      ? b.aprBasisPoints - a.aprBasisPoints ||
        a.balanceMinor - b.balanceMinor ||
        a.name.localeCompare(b.name, "en")
      : a.balanceMinor - b.balanceMinor ||
        b.aprBasisPoints - a.aprBasisPoints ||
        a.name.localeCompare(b.name, "en");
}

export function decimalAmountToMinor(value: string): number {
  const result = parseAmountToMinor(value);
  if (result < 0) throw new Error("Amount must not be negative.");
  return result;
}

export function calculateDebtPayoff(
  debts: readonly DebtProjectionInput[],
  strategy: DebtPayoffStrategy,
  extraPaymentMinor: number,
  startDate: string,
): DebtProjectionResult {
  if (debts.length === 0) throw new Error("Add at least one debt.");
  if (!Number.isSafeInteger(extraPaymentMinor) || extraPaymentMinor < 0) {
    throw new Error("Extra payment must be a non-negative integer amount.");
  }

  const working = debts.map((debt, index) => {
    if (
      !Number.isSafeInteger(debt.balanceMinor) ||
      debt.balanceMinor <= 0 ||
      !Number.isInteger(debt.aprBasisPoints) ||
      debt.aprBasisPoints < 0 ||
      debt.aprBasisPoints > 10_000 ||
      !Number.isSafeInteger(debt.minimumPaymentMinor) ||
      debt.minimumPaymentMinor < 0
    ) {
      throw new Error("Debt values are outside the supported range.");
    }
    return { ...debt, key: debt.id ?? `${index}:${debt.name}`, balanceMinor: debt.balanceMinor };
  });
  const monthlyBudgetMinor =
    working.reduce((sum, debt) => sum + debt.minimumPaymentMinor, 0) + extraPaymentMinor;
  if (monthlyBudgetMinor <= 0) throw new Error("Monthly debt payment must be greater than zero.");

  let totalInterestMinor = 0;
  let totalPaidMinor = 0;
  const payoffOrder: string[] = [];
  const schedule: DebtProjectionPayment[] = [];

  for (let month = 1; month <= MAX_DEBT_PROJECTION_MONTHS; month += 1) {
    const beforeInterest = working.reduce((sum, debt) => sum + debt.balanceMinor, 0);
    let monthInterestMinor = 0;

    for (const debt of working) {
      if (debt.balanceMinor <= 0) continue;
      const interestMinor = Math.round((debt.balanceMinor * debt.aprBasisPoints) / 120_000);
      debt.balanceMinor += interestMinor;
      monthInterestMinor += interestMinor;
    }
    totalInterestMinor += monthInterestMinor;

    let remainingBudgetMinor = monthlyBudgetMinor;
    let monthPaymentMinor = 0;
    for (const debt of working) {
      if (debt.balanceMinor <= 0) continue;
      const paymentMinor = Math.min(debt.balanceMinor, debt.minimumPaymentMinor);
      debt.balanceMinor -= paymentMinor;
      remainingBudgetMinor -= paymentMinor;
      monthPaymentMinor += paymentMinor;
      if (debt.balanceMinor === 0 && !payoffOrder.includes(debt.name)) payoffOrder.push(debt.name);
    }

    while (remainingBudgetMinor > 0) {
      const target = working.filter((debt) => debt.balanceMinor > 0).sort(debtSort(strategy))[0];
      if (!target) break;
      const paymentMinor = Math.min(target.balanceMinor, remainingBudgetMinor);
      target.balanceMinor -= paymentMinor;
      remainingBudgetMinor -= paymentMinor;
      monthPaymentMinor += paymentMinor;
      if (target.balanceMinor === 0 && !payoffOrder.includes(target.name)) {
        payoffOrder.push(target.name);
      }
    }

    totalPaidMinor += monthPaymentMinor;
    const remainingMinor = working.reduce((sum, debt) => sum + debt.balanceMinor, 0);
    schedule.push({
      month,
      date: shiftMonths(startDate, month),
      paymentMinor: monthPaymentMinor,
      interestMinor: monthInterestMinor,
      remainingMinor,
    });

    if (remainingMinor === 0) {
      return {
        status: "paid_off",
        strategy,
        payoffMonths: month,
        payoffDate: shiftMonths(startDate, month),
        totalInterestMinor,
        totalPaidMinor,
        monthlyBudgetMinor,
        payoffOrder,
        schedule,
        assumptions: [
          "APR stays fixed during the projection.",
          "Interest is estimated monthly and rounded to the nearest centavo.",
          "Minimum payments and freed payments roll toward the selected strategy.",
          "Lender fees, daily interest, and future charges are not included.",
        ],
      };
    }

    if (
      month >= 12 &&
      remainingMinor >= beforeInterest &&
      monthPaymentMinor <= monthInterestMinor
    ) {
      break;
    }
  }

  return {
    status: "non_amortizing",
    strategy,
    payoffMonths: null,
    payoffDate: null,
    totalInterestMinor,
    totalPaidMinor,
    monthlyBudgetMinor,
    payoffOrder,
    schedule,
    assumptions: [
      "The supplied payment does not pay the debts off within 600 months.",
      "APR stays fixed and interest is estimated monthly.",
      "Lender fees, daily interest, and future charges are not included.",
    ],
  };
}

export function calculateSavingsGoal(
  targetAmountMinor: number,
  currentSavedMinor: number,
  targetDate: string,
  currentDate: string,
): SavingsGoalProjectionResult {
  if (
    !Number.isSafeInteger(targetAmountMinor) ||
    targetAmountMinor <= 0 ||
    !Number.isSafeInteger(currentSavedMinor) ||
    currentSavedMinor < 0
  ) {
    throw new Error("Savings goal amounts are outside the supported range.");
  }

  const remainingMinor = Math.max(targetAmountMinor - currentSavedMinor, 0);
  const base = {
    targetAmountMinor,
    currentSavedMinor,
    remainingMinor,
    targetDate,
    assumptions: [
      "No investment return or interest is assumed.",
      "Contributions are treated as monthly deposits beginning next month.",
    ],
  };
  if (remainingMinor === 0) {
    return {
      ...base,
      status: "met",
      contributionMonths: 0,
      requiredMonthlyMinor: 0,
      amountDueNowMinor: 0,
    };
  }
  if (targetDate < currentDate) {
    return {
      ...base,
      status: "past_due",
      contributionMonths: 0,
      requiredMonthlyMinor: null,
      amountDueNowMinor: remainingMinor,
    };
  }

  const contributionMonths = monthDifference(currentDate, targetDate);
  if (contributionMonths <= 0) {
    return {
      ...base,
      status: "due_now",
      contributionMonths: 0,
      requiredMonthlyMinor: null,
      amountDueNowMinor: remainingMinor,
    };
  }

  return {
    ...base,
    status: "on_track",
    contributionMonths,
    requiredMonthlyMinor: Math.ceil(remainingMinor / contributionMonths),
    amountDueNowMinor: 0,
  };
}

export function detectRecurringCharges(
  transactions: readonly RecurringTransactionInput[],
): RecurringChargeResult[] {
  const groups = new Map<string, RecurringTransactionInput[]>();
  for (const transaction of transactions) {
    if (transaction.amountMinor === 0) continue;
    const key = `${transaction.categoryName.toLocaleLowerCase("en")}:${normalizeDescription(transaction.description)}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return [...groups.values()]
    .map((items) => [...items].sort((a, b) => a.date.localeCompare(b.date)))
    .filter(
      (items) => items.length >= 3 && new Set(items.map((item) => item.date.slice(0, 7))).size >= 3,
    )
    .map((items) => {
      const amounts = items.map((item) => Math.abs(item.amountMinor));
      const monthSteps = items
        .slice(1)
        .map((item, index) => monthDifference(items[index]!.date, item.date));
      const latestAmountMinor = amounts.at(-1)!;
      const previousAmountMinor = amounts.at(-2)!;
      const priceChangeMinor = latestAmountMinor - previousAmountMinor;
      const distinctMonths = new Set(items.map((item) => item.date.slice(0, 7))).size;
      const monthlySteps = monthSteps.filter((step) => step === 1).length;
      return {
        description: items[0]!.description.trim(),
        categoryName: items[0]!.categoryName,
        occurrenceDates: items.map((item) => item.date),
        occurrenceCount: items.length,
        cadence: monthlySteps >= Math.max(2, monthSteps.length - 1) ? "monthly" : "irregular",
        typicalAmountMinor: median(amounts),
        latestAmountMinor,
        lowestAmountMinor: Math.min(...amounts),
        highestAmountMinor: Math.max(...amounts),
        priceChangeMinor,
        priceChangePercent: roundPercent(priceChangeMinor, previousAmountMinor),
        confidence: distinctMonths >= 4 && monthlySteps >= 3 ? "high" : "medium",
      } satisfies RecurringChargeResult;
    })
    .sort(
      (a, b) =>
        b.latestAmountMinor - a.latestAmountMinor ||
        a.description.localeCompare(b.description, "en"),
    );
}

function isUnusual(value: number, baseline: readonly number[]): boolean {
  const center = median(baseline);
  const deviation = medianAbsoluteDeviation(baseline, center);
  if (deviation === 0) return value >= center * 2 && value > center;
  const robustScore = Math.abs(value - center) / (1.4826 * deviation);
  return robustScore >= 3.5 && value >= center * 1.5;
}

export function detectSpendingAnomalies(
  requested: readonly AnomalyTransactionInput[],
  baselineWindows: readonly AnomalyBaselineWindow[],
): SpendingAnomalyResult {
  const baselineTransactions = baselineWindows.flatMap((window) => window.transactions);
  const limitations: string[] = [];
  if (baselineWindows.length < MIN_CATEGORY_BASELINE_WINDOWS) {
    limitations.push("Fewer than three comparable baseline periods were available.");
  }

  const unusualTransactions = requested.flatMap((transaction) => {
    const baseline = baselineTransactions
      .filter(
        (item) =>
          item.categoryName.toLocaleLowerCase("en") ===
          transaction.categoryName.toLocaleLowerCase("en"),
      )
      .map((item) => Math.abs(item.amountMinor));
    const amountMinor = Math.abs(transaction.amountMinor);
    if (baseline.length < MIN_ANOMALY_BASELINE_COUNT || !isUnusual(amountMinor, baseline))
      return [];
    const baselineMedianMinor = median(baseline);
    return [
      {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        categoryName: transaction.categoryName,
        amountMinor,
        baselineMedianMinor,
        reason: `This amount is materially above the category's prior median based on ${baseline.length} transactions.`,
      },
    ];
  });

  const requestedCategories = new Map<string, { name: string; total: number }>();
  for (const transaction of requested) {
    const key = transaction.categoryName.toLocaleLowerCase("en");
    const current = requestedCategories.get(key) ?? { name: transaction.categoryName, total: 0 };
    current.total += Math.abs(transaction.amountMinor);
    requestedCategories.set(key, current);
  }

  const categorySpikes = [...requestedCategories.entries()].flatMap(([key, current]) => {
    const totals = baselineWindows.map((window) =>
      window.transactions
        .filter((item) => item.categoryName.toLocaleLowerCase("en") === key)
        .reduce((sum, item) => sum + Math.abs(item.amountMinor), 0),
    );
    if (totals.length < MIN_CATEGORY_BASELINE_WINDOWS || !isUnusual(current.total, totals))
      return [];
    const baselineMedianMinor = median(totals);
    return [
      {
        categoryName: current.name,
        requestedTotalMinor: current.total,
        baselineMedianMinor,
        reason: `This category total is materially above the median of ${totals.length} comparable periods.`,
      },
    ];
  });

  if (baselineTransactions.length < MIN_ANOMALY_BASELINE_COUNT) {
    limitations.push(
      "Too few prior transactions were available for reliable transaction-level detection.",
    );
  }

  return {
    status:
      baselineWindows.length >= MIN_CATEGORY_BASELINE_WINDOWS &&
      baselineTransactions.length >= MIN_ANOMALY_BASELINE_COUNT
        ? "reliable"
        : "insufficient",
    unusualTransactions,
    categorySpikes,
    limitations,
  };
}
