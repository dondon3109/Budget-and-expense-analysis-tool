import type {
  AccountBalanceSummary,
  AccountRecord,
  BudgetRecord,
  CashflowTrend,
  Currency,
  DashboardSummary,
  TransactionRecord,
  TransferFeeInsight,
} from "./types";
import type { TransferInput } from "./schemas";

function clampRoundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildRecurringExpenses(transactions: readonly TransactionRecord[]) {
  const groups = new Map<
    string,
    {
      description: string;
      categoryName: string;
      amounts: number[];
      months: Set<string>;
    }
  >();

  for (const transaction of transactions) {
    if (transaction.kind !== "expense") continue;
    const key = `${transaction.categoryId}:${transaction.description.trim().toLocaleLowerCase("en")}`;
    const current = groups.get(key) ?? {
      description: transaction.description.trim(),
      categoryName: transaction.categoryName,
      amounts: [],
      months: new Set<string>(),
    };
    current.amounts.push(Math.abs(transaction.amountMinor));
    current.months.add(transaction.date.slice(0, 7));
    groups.set(key, current);
  }

  return [...groups.values()]
    .filter((group) => group.months.size >= 3)
    .map((group) => ({
      description: group.description,
      categoryName: group.categoryName,
      averageMinor: Math.round(
        group.amounts.reduce((sum, amount) => sum + amount, 0) / group.amounts.length,
      ),
      occurrenceCount: group.months.size,
      latestMonth: [...group.months].sort().at(-1)!,
    }))
    .sort(
      (a, b) => b.averageMinor - a.averageMinor || a.description.localeCompare(b.description, "en"),
    )
    .slice(0, 3);
}

export function summarizeAccountBalances(
  accounts: readonly AccountRecord[],
): AccountBalanceSummary {
  const items = accounts.map((account) => {
    const balanceMinor = account.balanceMinor ?? 0;
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balanceMinor,
      balancesByCurrency:
        account.balancesByCurrency ??
        (account.currency === "USD"
          ? { PHP: 0, USD: balanceMinor }
          : { PHP: balanceMinor, USD: 0 }),
      archived: account.archived,
      system: Boolean(account.system),
      interest: account.interest,
    };
  });

  const balancesByCurrency: Record<Currency, number> = { PHP: 0, USD: 0 };
  for (const item of items) {
    balancesByCurrency[item.currency] += item.balanceMinor;
  }

  return {
    currency: "PHP",
    overallBalanceMinor: balancesByCurrency.PHP,
    balancesByCurrency,
    items,
  };
}

function dateFromIso(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDays(isoDate: string, amount: number): string {
  const date = dateFromIso(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIsoDate(date);
}

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function shiftUtcMonths(isoDate: string, amount: number): string {
  const date = dateFromIso(monthStart(isoDate));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatIsoDate(date);
}

function monthEnd(isoDate: string): string {
  return shiftUtcDays(shiftUtcMonths(isoDate, 1), -1);
}

export function buildCashflowTrend(
  transactions: readonly Pick<TransactionRecord, "date" | "kind" | "amountMinor">[],
  view: CashflowTrend["view"],
  anchorDate: string,
): CashflowTrend {
  const range =
    view === "weekly"
      ? { from: shiftUtcDays(anchorDate, -6), to: anchorDate }
      : view === "monthly"
        ? { from: monthStart(anchorDate), to: monthEnd(anchorDate) }
        : { from: shiftUtcMonths(anchorDate, -5), to: monthEnd(anchorDate) };
  const granularity = view === "sixMonth" ? "month" : "day";
  const pointDates: string[] = [];

  if (granularity === "day") {
    for (let date = range.from; date <= range.to; date = shiftUtcDays(date, 1)) {
      pointDates.push(date);
    }
  } else {
    for (let date = range.from; date <= range.to; date = shiftUtcMonths(date, 1)) {
      pointDates.push(date);
    }
  }

  const points = new Map(
    pointDates.map((date) => [date, { date, incomeMinor: 0, expenseMinor: 0 }]),
  );

  for (const transaction of transactions) {
    if (
      transaction.kind === "transfer" ||
      transaction.date < range.from ||
      transaction.date > range.to
    ) {
      continue;
    }

    const bucketDate = granularity === "day" ? transaction.date : monthStart(transaction.date);
    const point = points.get(bucketDate);
    if (!point) continue;

    if (transaction.kind === "income") point.incomeMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "expense") point.expenseMinor += Math.abs(transaction.amountMinor);
  }

  return { view, granularity, range, points: [...points.values()] };
}

export function buildDashboardSummary(
  transactions: readonly TransactionRecord[],
  budgets: readonly BudgetRecord[],
  period: { from: string; to: string },
  accountBalances: AccountBalanceSummary = {
    currency: "PHP",
    overallBalanceMinor: 0,
    balancesByCurrency: { PHP: 0, USD: 0 },
    items: [],
  },
): DashboardSummary {
  const inPeriod = transactions.filter(
    (transaction) => transaction.date >= period.from && transaction.date <= period.to,
  );
  const moneyInMinor = inPeriod
    .filter((transaction) => transaction.kind === "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountMinor), 0);
  const moneyOutMinor = inPeriod
    .filter((transaction) => transaction.kind === "expense")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountMinor), 0);

  const incomeByCurrency: Record<Currency, number> = { PHP: 0, USD: 0 };
  const expenseByCurrency: Record<Currency, number> = { PHP: 0, USD: 0 };
  for (const transaction of inPeriod) {
    if (transaction.kind === "income") {
      incomeByCurrency[transaction.currency] += Math.abs(transaction.amountMinor);
    } else if (transaction.kind === "expense") {
      expenseByCurrency[transaction.currency] += Math.abs(transaction.amountMinor);
    }
  }

  const spending = new Map<
    string,
    { name: string; color: string; iconEmoji?: string | null; amountMinor: number }
  >();
  for (const transaction of inPeriod) {
    if (transaction.kind !== "expense") continue;
    const existing = spending.get(transaction.categoryId);
    spending.set(transaction.categoryId, {
      name: transaction.categoryName,
      color: transaction.categoryColor,
      ...(transaction.categoryIconEmoji ? { iconEmoji: transaction.categoryIconEmoji } : {}),
      amountMinor: (existing?.amountMinor ?? 0) + Math.abs(transaction.amountMinor),
    });
  }

  const budgetMonth = period.from.slice(0, 7);
  const currentBudgets = budgets.filter((budget) => budget.month.startsWith(budgetMonth));
  const budgetLimitMinor = currentBudgets.reduce((sum, budget) => sum + budget.limitMinor, 0);
  const budgetedSpendingMinor = currentBudgets.reduce(
    (sum, budget) => sum + (spending.get(budget.categoryId)?.amountMinor ?? 0),
    0,
  );

  const monthly = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  for (const transaction of transactions) {
    if (transaction.kind === "transfer") continue;
    const month = transaction.date.slice(0, 7);
    const current = monthly.get(month) ?? { incomeMinor: 0, expenseMinor: 0 };
    if (transaction.kind === "income") current.incomeMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "expense") current.expenseMinor += Math.abs(transaction.amountMinor);
    monthly.set(month, current);
  }

  return {
    period,
    currency: "PHP",
    accountBalances,
    metrics: {
      moneyInMinor,
      moneyOutMinor,
      netMinor: moneyInMinor - moneyOutMinor,
      incomeByCurrency,
      expenseByCurrency,
      budgetLimitMinor,
      remainingBudgetMinor: budgetLimitMinor - budgetedSpendingMinor,
      budgetUsedPercent:
        budgetLimitMinor === 0
          ? 0
          : clampRoundPercent((budgetedSpendingMinor / budgetLimitMinor) * 100),
    },
    spendingByCategory: [...spending.entries()]
      .map(([categoryId, category]) => ({
        categoryId,
        ...category,
        sharePercent:
          moneyOutMinor === 0 ? 0 : clampRoundPercent((category.amountMinor / moneyOutMinor) * 100),
      }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    monthlyTrend: [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, totals]) => ({ month, ...totals })),
    budgetProgress: currentBudgets.map((budget) => {
      const spentMinor = spending.get(budget.categoryId)?.amountMinor ?? 0;
      return {
        categoryId: budget.categoryId,
        name: budget.categoryName,
        color: budget.categoryColor,
        spentMinor,
        limitMinor: budget.limitMinor,
        remainingMinor: budget.limitMinor - spentMinor,
        usedPercent:
          budget.limitMinor === 0 ? 0 : clampRoundPercent((spentMinor / budget.limitMinor) * 100),
      };
    }),
    insights: {
      savingsMinor: moneyInMinor - moneyOutMinor,
      savingsRatePercent:
        moneyInMinor === 0
          ? null
          : clampRoundPercent(((moneyInMinor - moneyOutMinor) / moneyInMinor) * 100),
      recurringExpenses: buildRecurringExpenses(transactions),
    },
  };
}

export interface TransferFeeTotalsByCurrency {
  currency: Currency;
  transfers: number;
  feeChargedTransfers: number;
  feesMinor: number;
}

export interface TransferFeeActivityRow {
  /** ISO date of a transfer sender leg. */
  date: string;
  currency: Currency;
  /** The fee attached to the sender leg, or null for a fee-free transfer. */
  transferFeeMinor: number | null;
}

export interface TransferLeg {
  accountId: string;
  amountMinor: number;
  transferFeeMinor: number | null;
  description: string;
}

/** Builds the balanced sender and receiver rows used by every Zoption client and the Worker. */
export function buildTransferLegs(input: TransferInput): [TransferLeg, TransferLeg] {
  const fee = input.transferFeeMinor ?? 0;
  const description = input.description?.trim() || "Transfer";
  return [
    {
      accountId: input.fromAccountId,
      amountMinor: -input.amountMinor,
      transferFeeMinor: fee > 0 ? fee : null,
      description,
    },
    {
      accountId: input.toAccountId,
      amountMinor: input.amountMinor - fee,
      transferFeeMinor: null,
      description,
    },
  ];
}

export interface TransferFeeInsightInput {
  /** All-time totals grouped by currency. */
  totals: TransferFeeTotalsByCurrency[];
  /** Sender legs of transfers within the recent window, oldest first. */
  recent: TransferFeeActivityRow[];
}

function isoDayOfWeekMondayZero(isoDate: string): number {
  return (dateFromIso(isoDate).getUTCDay() + 6) % 7;
}

function startOfWeekMonday(isoDate: string): string {
  return shiftUtcDays(isoDate, -isoDayOfWeekMondayZero(isoDate));
}

function emptyFeeCurrencyTotals(): Record<Currency, number> {
  return { PHP: 0, USD: 0 };
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildTransferFeeInsight(input: TransferFeeInsightInput): TransferFeeInsight {
  const feesByCurrency = emptyFeeCurrencyTotals();
  let totalTransfers = 0;
  let totalFeeChargedTransfers = 0;
  for (const row of input.totals) {
    totalTransfers += row.transfers;
    totalFeeChargedTransfers += row.feeChargedTransfers;
    const currency = row.currency;
    feesByCurrency[currency] += row.feesMinor;
  }

  const weeklyByStart = new Map<string, TransferFeeInsight["weekly"][number]>();
  for (const row of input.recent) {
    const weekStart = startOfWeekMonday(row.date);
    const current = weeklyByStart.get(weekStart) ?? {
      weekStart,
      weekEnd: shiftUtcDays(weekStart, 6),
      transfers: 0,
      feeChargedTransfers: 0,
      feesByCurrency: emptyFeeCurrencyTotals(),
    };
    current.transfers += 1;
    if (row.transferFeeMinor != null && row.transferFeeMinor > 0) {
      current.feeChargedTransfers += 1;
      current.feesByCurrency[row.currency] += row.transferFeeMinor;
    }
    weeklyByStart.set(weekStart, current);
  }

  const weekly = [...weeklyByStart.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const recentWeekCount = weekly.filter((week) => week.transfers > 0).length;
  const recentTransferCount = weekly.reduce((sum, week) => sum + week.transfers, 0);
  const recentFeeChargedCount = weekly.reduce((sum, week) => sum + week.feeChargedTransfers, 0);

  return {
    hasFees: totalFeeChargedTransfers > 0,
    totalTransfers,
    totalFeeChargedTransfers,
    feesByCurrency,
    weekly,
    recentWeekCount,
    recentAverageTransfersPerWeek:
      recentWeekCount === 0 ? 0 : roundToOneDecimal(recentTransferCount / recentWeekCount),
    recentAverageFeeChargedTransfersPerWeek:
      recentWeekCount === 0 ? 0 : roundToOneDecimal(recentFeeChargedCount / recentWeekCount),
  };
}
