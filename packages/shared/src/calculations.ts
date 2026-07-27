import type {
  AccountBalanceSummary,
  AccountRecord,
  BudgetRecord,
  CashflowTrend,
  DashboardSummary,
  TransactionRecord,
} from "./types";

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
  const items = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceMinor: account.balanceMinor ?? 0,
    archived: account.archived,
    system: Boolean(account.system),
  }));

  return {
    currency: "PHP",
    overallBalanceMinor: items.reduce((sum, account) => sum + account.balanceMinor, 0),
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

  const spending = new Map<string, { name: string; color: string; amountMinor: number }>();
  for (const transaction of inPeriod) {
    if (transaction.kind !== "expense") continue;
    const existing = spending.get(transaction.categoryId);
    spending.set(transaction.categoryId, {
      name: transaction.categoryName,
      color: transaction.categoryColor,
      amountMinor: (existing?.amountMinor ?? 0) + Math.abs(transaction.amountMinor),
    });
  }

  const budgetMonth = period.from.slice(0, 7);
  const currentBudgets = budgets.filter((budget) => budget.month.startsWith(budgetMonth));
  const budgetLimitMinor = currentBudgets.reduce((sum, budget) => sum + budget.limitMinor, 0);

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
      budgetLimitMinor,
      remainingBudgetMinor: budgetLimitMinor - moneyOutMinor,
      budgetUsedPercent:
        budgetLimitMinor === 0 ? 0 : clampRoundPercent((moneyOutMinor / budgetLimitMinor) * 100),
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
