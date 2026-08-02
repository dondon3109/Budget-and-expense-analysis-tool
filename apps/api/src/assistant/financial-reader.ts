import {
  calculateDebtPayoff,
  calculateSavingsGoal,
  decimalAmountToMinor,
  detectRecurringCharges,
  detectSpendingAnomalies,
  summarizeAccountBalances,
  type AccountRecord,
  type AssistantToolResultEnvelope,
  type DashboardSummary,
  type DebtProjectionInput,
  type TransactionKind,
} from "@zoption/shared";

import { accountRepository, type AccountRepository } from "../db/accounts";
import { budgetRepository, type BudgetRepository } from "../db/budgets";
import { categoryRepository, type CategoryRepository } from "../db/categories";
import { debtRepository, type DebtRepository } from "../db/debts";
import { loadDashboard } from "../db/dashboard";
import { financialGoalRepository, type FinancialGoalRepository } from "../db/goals";
import { transactionRepository, type TransactionRepository } from "../db/transactions";
import type { Bindings } from "../types";
import { assessTransactionDataQuality, type AssistantAnalysisTransaction } from "./data-quality";

export interface FinancialReadContext {
  env: Bindings;
  tenantId: string;
}

export interface AccountBalancesInput {
  accountName?: string;
}

export interface PeriodSummaryInput {
  from: string;
  to: string;
  accountName?: string;
}

export interface SpendingByCategoryInput {
  from: string;
  to: string;
  categoryName?: string;
}

export interface BudgetVsActualInput {
  from: string;
  to: string;
}

export interface DebtPayoffInput {
  strategy: "avalanche" | "snowball";
  extraPayment?: string;
  debtNames?: string[];
  debts?: Array<{
    name: string;
    balance: string;
    aprPercent: number;
    minimumPayment: string;
  }>;
  startDate: string;
}

export interface SavingsGoalInput {
  goalName?: string;
  targetAmount?: string;
  targetDate?: string;
  currentSaved?: string;
  currentDate: string;
}

export interface TransactionReadInput {
  from?: string;
  to?: string;
  kind?: TransactionKind;
  categoryName?: string;
  accountName?: string;
  search?: string;
  page: number;
}

export interface FinancialReader {
  getTransactionDateBounds(context: FinancialReadContext): Promise<{
    from: string;
    to: string;
    transactionCount: number;
  } | null>;
  getAccountBalances(
    context: FinancialReadContext,
    input?: AccountBalancesInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  getPeriodSummary(
    context: FinancialReadContext,
    input: PeriodSummaryInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  getSpendingByCategory(
    context: FinancialReadContext,
    input: SpendingByCategoryInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  getBudgetVsActual(
    context: FinancialReadContext,
    input: BudgetVsActualInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  getBudgetStatus(
    context: FinancialReadContext,
    month: string,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  detectRecurringCharges(
    context: FinancialReadContext,
    through: string,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  detectSpendingAnomalies(
    context: FinancialReadContext,
    input: PeriodSummaryInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  calculateDebtPayoff(
    context: FinancialReadContext,
    input: DebtPayoffInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  calculateSavingsGoal(
    context: FinancialReadContext,
    input: SavingsGoalInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  listTransactions(
    context: FinancialReadContext,
    input: TransactionReadInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  listCategories(
    context: FinancialReadContext,
    kind?: TransactionKind,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
}

type DashboardPeriod = Pick<PeriodSummaryInput, "from" | "to">;
type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: DashboardPeriod,
  accountId?: string,
) => Promise<DashboardSummary>;

interface AnalysisTransaction extends AssistantAnalysisTransaction {
  categoryId: string;
  accountId: string | null;
}

type AnalysisLoader = (
  context: FinancialReadContext,
  from: string,
  to: string,
  accountId?: string,
) => Promise<AnalysisTransaction[]>;

const MAX_ANALYSIS_TRANSACTIONS = 5_000;
const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(amountMinor: number): string {
  return `PHP ${moneyFormatter.format(amountMinor / 100)}`;
}

function compactDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117).trimEnd()}…`;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function findAccountByName(items: AccountRecord[], accountName: string): AccountRecord | undefined {
  const requestedName = normalizedName(accountName);
  const exact = items.find((account) => normalizedName(account.name) === requestedName);
  if (exact) return exact;
  const withoutGenericSuffix = requestedName.replace(/\s+account$/, "").trim();
  if (!withoutGenericSuffix || withoutGenericSuffix === requestedName) return undefined;
  const matches = items.filter((account) => normalizedName(account.name) === withoutGenericSuffix);
  return matches.length === 1 ? matches[0] : undefined;
}

function monthDifference(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

function coveredMonthCount(from: string, to: string): number {
  return monthDifference(from, to) + 1;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: string, amount: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIsoDate(date);
}

function shiftMonths(value: string, amount: number): string {
  const date = dateFromIso(`${value.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatIsoDate(date);
}

function monthEnd(value: string): string {
  const date = dateFromIso(shiftMonths(value, 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return formatIsoDate(date);
}

function daysInclusive(from: string, to: string): number {
  return Math.floor((dateFromIso(to).valueOf() - dateFromIso(from).valueOf()) / 86_400_000) + 1;
}

function source<T extends object>(
  data: T,
  sourceType: "transactions" | "budgets" | "accounts" | "goals" | "debts",
  options: {
    period?: { from: string; to: string };
    baselinePeriod?: { from: string; to: string };
    filters?: {
      accountName?: string;
      categoryName?: string;
      goalName?: string;
      debtNames?: string[];
    };
    recordCount?: number;
    quality?: ReturnType<typeof assessTransactionDataQuality>;
  } = {},
): AssistantToolResultEnvelope<T> {
  return {
    data,
    source: {
      sourceType,
      ...(options.period ? { period: options.period } : {}),
      ...(options.baselinePeriod ? { baselinePeriod: options.baselinePeriod } : {}),
      ...(options.filters ? { filters: options.filters } : {}),
      ...(options.recordCount === undefined ? {} : { recordCount: options.recordCount }),
    },
    dataQuality: options.quality ?? { status: "reliable", signals: [] },
  };
}

async function loadAnalysisTransactions(
  context: FinancialReadContext,
  from: string,
  to: string,
  accountId?: string,
): Promise<AnalysisTransaction[]> {
  const rows = await context.env.DB.prepare(
    `SELECT t.id, t.date, t.description, t.amount_minor AS amountMinor, t.kind,
            t.category_id AS categoryId, c.name AS categoryName,
            t.account_id AS accountId, COALESCE(a.name, 'Unassigned') AS accountName,
            t.source_kind AS sourceKind, t.import_id AS importId
     FROM transactions t
     INNER JOIN categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
     LEFT JOIN accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND t.date >= ? AND t.date <= ?
       AND (? IS NULL OR t.account_id = ?)
       AND (t.kind != 'transfer' OR t.transfer_group_id IS NULL OR t.amount_minor < 0)
     ORDER BY t.date, t.id
     LIMIT ?`,
  )
    .bind(
      context.tenantId,
      from,
      to,
      accountId ?? null,
      accountId ?? null,
      MAX_ANALYSIS_TRANSACTIONS + 1,
    )
    .all<AnalysisTransaction>();
  if (rows.results.length > MAX_ANALYSIS_TRANSACTIONS) {
    throw new Error("Narrow the date range to 5,000 transactions or fewer.");
  }
  return rows.results;
}

function budgetMonths(from: string, to: string): string[] {
  const count = coveredMonthCount(from, to);
  if (count > 24) throw new Error("Choose a budget comparison of 24 months or less.");
  return Array.from({ length: count }, (_, index) => shiftMonths(from, index));
}

export function createFinancialReader(
  options: {
    accounts?: AccountRepository;
    budgets?: BudgetRepository;
    categories?: CategoryRepository;
    debts?: DebtRepository;
    goals?: FinancialGoalRepository;
    transactions?: TransactionRepository;
    dashboardLoader?: DashboardLoader;
    analysisLoader?: AnalysisLoader;
  } = {},
): FinancialReader {
  const accounts = options.accounts ?? accountRepository;
  const budgets = options.budgets ?? budgetRepository;
  const categories = options.categories ?? categoryRepository;
  const debts = options.debts ?? debtRepository;
  const goals = options.goals ?? financialGoalRepository;
  const transactions = options.transactions ?? transactionRepository;
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const analysisLoader = options.analysisLoader ?? loadAnalysisTransactions;

  return {
    async getTransactionDateBounds(context) {
      const row = await context.env.DB.prepare(
        `SELECT MIN(date) AS first_date, MAX(date) AS last_date, COUNT(*) AS transaction_count
         FROM transactions
         WHERE tenant_id = ?
           AND (kind != 'transfer' OR transfer_group_id IS NULL OR amount_minor < 0)`,
      )
        .bind(context.tenantId)
        .first<{
          first_date: string | null;
          last_date: string | null;
          transaction_count: number;
        }>();
      return row?.first_date && row.last_date
        ? { from: row.first_date, to: row.last_date, transactionCount: row.transaction_count }
        : null;
    },

    async getAccountBalances(context, input = {}) {
      const accountItems = await accounts.list(context.env, context.tenantId);
      const account = input.accountName
        ? findAccountByName(accountItems, input.accountName)
        : undefined;
      if (input.accountName && !account) {
        return source({ accountName: input.accountName, filterMatched: false }, "accounts", {
          filters: { accountName: input.accountName },
        });
      }

      const summary = summarizeAccountBalances(account ? [account] : accountItems);
      return source(
        {
          ...(account ? { accountName: account.name, filterMatched: true } : {}),
          currency: summary.currency,
          overallBalance: formatMoney(summary.overallBalanceMinor),
          items: summary.items.map((item) => ({
            name: item.name,
            type: item.type,
            balance: formatMoney(item.balanceMinor),
            removed: item.archived,
          })),
        },
        "accounts",
        {
          ...(account ? { filters: { accountName: account.name } } : {}),
          recordCount: summary.items.length,
          quality: {
            status: "limited",
            signals: [
              {
                code: "ledger_balance_no_opening_snapshot",
                message:
                  "Balances are sums of recorded transactions and may omit money held before tracking began.",
              },
            ],
          },
        },
      );
    },

    async getPeriodSummary(context, input) {
      const accountItems = input.accountName
        ? await accounts.list(context.env, context.tenantId)
        : undefined;
      const account = input.accountName
        ? findAccountByName(accountItems!, input.accountName)
        : undefined;
      if (input.accountName && !account) {
        return source({ accountName: input.accountName, filterMatched: false }, "transactions", {
          period: { from: input.from, to: input.to },
          filters: { accountName: input.accountName },
        });
      }

      const [summary, analysis] = await Promise.all([
        dashboardLoader(
          context.env,
          context.tenantId,
          { from: input.from, to: input.to },
          account?.id,
        ),
        analysisLoader(context, input.from, input.to, account?.id),
      ]);
      const monthCount = coveredMonthCount(input.from, input.to);
      const quality = assessTransactionDataQuality(analysis, input);
      if (monthCount > 24) {
        quality.status = "limited";
        quality.signals.push({
          code: "trend_window_limited",
          message:
            "The exact totals cover the full period, but monthly trend points are omitted beyond 24 months.",
        });
      }
      const periodStartMonth = input.from.slice(0, 7);
      const periodEndMonth = input.to.slice(0, 7);
      return source(
        {
          ...(account ? { accountName: account.name, filterMatched: true } : {}),
          period: summary.period,
          currency: summary.currency,
          income: formatMoney(summary.metrics.moneyInMinor),
          expenses: formatMoney(summary.metrics.moneyOutMinor),
          net: formatMoney(summary.metrics.netMinor),
          monthlyAverages: {
            coveredMonthCount: monthCount,
            includesZeroTransactionMonths: true,
            income: formatMoney(Math.round(summary.metrics.moneyInMinor / monthCount)),
            expenses: formatMoney(Math.round(summary.metrics.moneyOutMinor / monthCount)),
            net: formatMoney(Math.round(summary.metrics.netMinor / monthCount)),
          },
          savingsRatePercent: summary.insights.savingsRatePercent,
          spendingByCategory: summary.spendingByCategory.map((item) => ({
            name: item.name,
            amount: formatMoney(item.amountMinor),
            sharePercent: item.sharePercent,
          })),
          monthlyTrend:
            monthCount > 24
              ? []
              : summary.monthlyTrend
                  .filter((item) => item.month >= periodStartMonth && item.month <= periodEndMonth)
                  .map((item) => ({
                    month: item.month,
                    income: formatMoney(item.incomeMinor),
                    expenses: formatMoney(item.expenseMinor),
                  })),
        },
        "transactions",
        {
          period: { from: input.from, to: input.to },
          ...(account ? { filters: { accountName: account.name } } : {}),
          recordCount: analysis.length,
          quality,
        },
      );
    },

    async getSpendingByCategory(context, input) {
      const [analysis, categoryItems] = await Promise.all([
        analysisLoader(context, input.from, input.to),
        input.categoryName ? categories.list(context.env, context.tenantId) : Promise.resolve([]),
      ]);
      const category = input.categoryName
        ? categoryItems.find(
            (item) => normalizedName(item.name) === normalizedName(input.categoryName!),
          )
        : undefined;
      if (input.categoryName && !category) {
        return source({ categoryName: input.categoryName, filterMatched: false }, "transactions", {
          period: input,
          filters: { categoryName: input.categoryName },
          recordCount: 0,
        });
      }

      const expenses = analysis.filter(
        (item) => item.kind === "expense" && (!category || item.categoryId === category.id),
      );
      const grouped = new Map<string, { name: string; amountMinor: number; count: number }>();
      for (const item of expenses) {
        const current = grouped.get(item.categoryId) ?? {
          name: item.categoryName,
          amountMinor: 0,
          count: 0,
        };
        current.amountMinor += Math.abs(item.amountMinor);
        current.count += 1;
        grouped.set(item.categoryId, current);
      }
      const totalMinor = expenses.reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
      const items = [...grouped.values()]
        .map((item) => ({
          name: item.name,
          amount: formatMoney(item.amountMinor),
          transactionCount: item.count,
          sharePercent:
            totalMinor === 0 ? 0 : Math.round((item.amountMinor / totalMinor) * 1_000) / 10,
        }))
        .sort((a, b) => b.transactionCount - a.transactionCount || a.name.localeCompare(b.name));
      return source(
        {
          ...(category ? { categoryName: category.name, filterMatched: true } : {}),
          period: input,
          total: formatMoney(totalMinor),
          items,
        },
        "transactions",
        {
          period: input,
          ...(category ? { filters: { categoryName: category.name } } : {}),
          recordCount: expenses.length,
          quality: assessTransactionDataQuality(analysis, input),
        },
      );
    },

    async getBudgetVsActual(context, input) {
      const months = budgetMonths(input.from, input.to);
      const [analysis, plans] = await Promise.all([
        analysisLoader(context, input.from, input.to),
        Promise.all(months.map((month) => budgets.list(context.env, context.tenantId, month))),
      ]);
      const resultMonths = plans.map((plan) => {
        const monthKey = plan.month.slice(0, 7);
        const monthExpenses = analysis.filter(
          (item) => item.kind === "expense" && item.date.slice(0, 7) === monthKey,
        );
        const spending = new Map<string, number>();
        for (const item of monthExpenses) {
          spending.set(
            item.categoryId,
            (spending.get(item.categoryId) ?? 0) + Math.abs(item.amountMinor),
          );
        }
        const items = plan.items
          .map((item) => {
            const spentMinor = spending.get(item.categoryId) ?? 0;
            return {
              name: item.categoryName,
              limit: formatMoney(item.limitMinor),
              spent: formatMoney(spentMinor),
              remaining: formatMoney(item.limitMinor - spentMinor),
              usedPercent:
                item.limitMinor === 0 ? 0 : Math.round((spentMinor / item.limitMinor) * 1_000) / 10,
            };
          })
          .filter((item) => item.limit !== "PHP 0.00" || item.spent !== "PHP 0.00");
        const limitMinor = plan.items.reduce((sum, item) => sum + item.limitMinor, 0);
        const spentMinor = monthExpenses.reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
        const fullMonth = input.from <= plan.month && input.to >= monthEnd(plan.month);
        return {
          month: plan.month,
          coverage: fullMonth ? "full_month" : "partial_month",
          limit: formatMoney(limitMinor),
          spent: formatMoney(spentMinor),
          remaining: formatMoney(limitMinor - spentMinor),
          usedPercent: limitMinor === 0 ? 0 : Math.round((spentMinor / limitMinor) * 1_000) / 10,
          hasBudget: limitMinor > 0,
          items,
        };
      });
      const totalLimitMinor = plans.reduce(
        (sum, plan) => sum + plan.items.reduce((monthSum, item) => monthSum + item.limitMinor, 0),
        0,
      );
      const totalSpentMinor = analysis
        .filter((item) => item.kind === "expense")
        .reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
      return source(
        {
          period: input,
          totalLimit: formatMoney(totalLimitMinor),
          totalSpent: formatMoney(totalSpentMinor),
          remaining: formatMoney(totalLimitMinor - totalSpentMinor),
          usedPercent:
            totalLimitMinor === 0
              ? 0
              : Math.round((totalSpentMinor / totalLimitMinor) * 1_000) / 10,
          months: resultMonths,
        },
        "budgets",
        {
          period: input,
          recordCount: analysis.length,
          quality: assessTransactionDataQuality(analysis, input),
        },
      );
    },

    async getBudgetStatus(context, month) {
      return this.getBudgetVsActual(context, { from: month, to: monthEnd(month) });
    },

    async detectRecurringCharges(context, through) {
      const from = shiftMonths(through, -11);
      const analysis = await analysisLoader(context, from, through);
      const expenses = analysis.filter((item) => item.kind === "expense");
      const items = detectRecurringCharges(expenses).map((item) => ({
        description: item.description,
        categoryName: item.categoryName,
        occurrenceDates: item.occurrenceDates,
        occurrenceCount: item.occurrenceCount,
        cadence: item.cadence,
        typicalAmount: formatMoney(item.typicalAmountMinor),
        latestAmount: formatMoney(item.latestAmountMinor),
        lowestAmount: formatMoney(item.lowestAmountMinor),
        highestAmount: formatMoney(item.highestAmountMinor),
        priceChange: formatMoney(item.priceChangeMinor),
        priceChangePercent: item.priceChangePercent,
        confidence: item.confidence,
      }));
      return source({ analyzedWindow: { from, to: through }, items }, "transactions", {
        period: { from, to: through },
        recordCount: expenses.length,
        quality: assessTransactionDataQuality(analysis, { from, to: through }),
      });
    },

    async detectSpendingAnomalies(context, input) {
      const duration = daysInclusive(input.from, input.to);
      if (duration > 366) throw new Error("Choose an anomaly period of 366 days or less.");
      const baselineTo = shiftDays(input.from, -1);
      const baselineFrom = shiftDays(baselineTo, -(duration * 6 - 1));
      const [requested, baseline] = await Promise.all([
        analysisLoader(context, input.from, input.to),
        analysisLoader(context, baselineFrom, baselineTo),
      ]);
      const baselineWindows = Array.from({ length: 6 }, (_, index) => {
        const from = shiftDays(baselineFrom, index * duration);
        const to = shiftDays(from, duration - 1);
        return {
          from,
          to,
          transactions: baseline.filter((item) => item.date >= from && item.date <= to),
        };
      });
      const result = detectSpendingAnomalies(
        requested.filter((item) => item.kind === "expense"),
        baselineWindows.map((window) => ({
          ...window,
          transactions: window.transactions.filter((item) => item.kind === "expense"),
        })),
      );
      const quality = assessTransactionDataQuality(requested, input);
      for (const limitation of result.limitations) {
        quality.status = result.status === "insufficient" ? "insufficient" : quality.status;
        quality.signals.push({ code: "anomaly_baseline_limit", message: limitation });
      }
      return source(
        {
          status: result.status,
          unusualTransactions: result.unusualTransactions.map((item) => ({
            date: item.date,
            description: compactDescription(item.description),
            categoryName: item.categoryName,
            amount: formatMoney(item.amountMinor),
            baselineMedian: formatMoney(item.baselineMedianMinor),
            reason: item.reason,
          })),
          categorySpikes: result.categorySpikes.map((item) => ({
            categoryName: item.categoryName,
            requestedTotal: formatMoney(item.requestedTotalMinor),
            baselineMedian: formatMoney(item.baselineMedianMinor),
            reason: item.reason,
          })),
        },
        "transactions",
        {
          period: input,
          baselinePeriod: { from: baselineFrom, to: baselineTo },
          recordCount: requested.length,
          quality,
        },
      );
    },

    async calculateDebtPayoff(context, input) {
      let selected: DebtProjectionInput[];
      if (input.debts?.length) {
        selected = input.debts.map((item) => ({
          name: item.name,
          balanceMinor: decimalAmountToMinor(item.balance),
          aprBasisPoints: Math.round(item.aprPercent * 100),
          minimumPaymentMinor: decimalAmountToMinor(item.minimumPayment),
        }));
      } else {
        const saved = (await debts.list(context.env, context.tenantId)).filter(
          (item) =>
            item.status === "active" &&
            (!input.debtNames?.length ||
              input.debtNames.some((name) => normalizedName(name) === normalizedName(item.name))),
        );
        if (
          input.debtNames?.length &&
          saved.length !== new Set(input.debtNames.map(normalizedName)).size
        ) {
          return source({ filterMatched: false, requestedDebtNames: input.debtNames }, "debts", {
            filters: { debtNames: input.debtNames },
          });
        }
        selected = saved.map((item) => ({
          id: item.id,
          name: item.name,
          balanceMinor: item.balanceMinor,
          aprBasisPoints: item.aprBasisPoints,
          minimumPaymentMinor: item.minimumPaymentMinor,
        }));
      }
      const result = calculateDebtPayoff(
        selected,
        input.strategy,
        input.extraPayment ? decimalAmountToMinor(input.extraPayment) : 0,
        input.startDate,
      );
      const schedule =
        result.schedule.length <= 24
          ? result.schedule
          : [...result.schedule.slice(0, 23), result.schedule.at(-1)!];
      return source(
        {
          status: result.status,
          strategy: result.strategy,
          payoffMonths: result.payoffMonths,
          payoffDate: result.payoffDate,
          totalInterest: formatMoney(result.totalInterestMinor),
          totalPaid: formatMoney(result.totalPaidMinor),
          monthlyBudget: formatMoney(result.monthlyBudgetMinor),
          payoffOrder: result.payoffOrder,
          schedule: schedule.map((item) => ({
            month: item.month,
            date: item.date,
            payment: formatMoney(item.paymentMinor),
            interest: formatMoney(item.interestMinor),
            remaining: formatMoney(item.remainingMinor),
          })),
          scheduleLimited: schedule.length < result.schedule.length,
          assumptions: result.assumptions,
        },
        "debts",
        {
          filters: { debtNames: selected.map((item) => item.name) },
          recordCount: selected.length,
        },
      );
    },

    async calculateSavingsGoal(context, input) {
      let goalName = input.goalName;
      let targetAmountMinor: number;
      let currentAmountMinor: number;
      let targetDate: string;
      if (input.goalName) {
        const goal = (await goals.list(context.env, context.tenantId)).find(
          (item) => normalizedName(item.name) === normalizedName(input.goalName!),
        );
        if (!goal) {
          return source({ goalName: input.goalName, filterMatched: false }, "goals", {
            filters: { goalName: input.goalName },
          });
        }
        goalName = goal.name;
        targetAmountMinor = goal.targetAmountMinor;
        currentAmountMinor = goal.currentAmountMinor;
        targetDate = goal.targetDate;
      } else {
        targetAmountMinor = decimalAmountToMinor(input.targetAmount!);
        currentAmountMinor = decimalAmountToMinor(input.currentSaved!);
        targetDate = input.targetDate!;
      }
      const result = calculateSavingsGoal(
        targetAmountMinor,
        currentAmountMinor,
        targetDate,
        input.currentDate,
      );
      return source(
        {
          ...(goalName ? { goalName, filterMatched: true } : {}),
          status: result.status,
          targetAmount: formatMoney(result.targetAmountMinor),
          currentSaved: formatMoney(result.currentSavedMinor),
          remaining: formatMoney(result.remainingMinor),
          targetDate: result.targetDate,
          contributionMonths: result.contributionMonths,
          requiredMonthly:
            result.requiredMonthlyMinor === null ? null : formatMoney(result.requiredMonthlyMinor),
          amountDueNow: formatMoney(result.amountDueNowMinor),
          assumptions: result.assumptions,
        },
        "goals",
        {
          ...(goalName ? { filters: { goalName } } : {}),
          recordCount: 1,
        },
      );
    },

    async listTransactions(context, input) {
      const [accountItems, categoryItems] = await Promise.all([
        input.accountName ? accounts.list(context.env, context.tenantId) : Promise.resolve([]),
        input.categoryName ? categories.list(context.env, context.tenantId) : Promise.resolve([]),
      ]);
      const accountId = input.accountName
        ? findAccountByName(accountItems, input.accountName)?.id
        : undefined;
      const categoryId = input.categoryName
        ? categoryItems.find(
            (category) => normalizedName(category.name) === normalizedName(input.categoryName!),
          )?.id
        : undefined;
      if ((input.accountName && !accountId) || (input.categoryName && !categoryId)) {
        return source(
          { items: [], page: input.page, total: 0, totalPages: 1, filterMatched: false },
          "transactions",
          {
            ...(input.from && input.to ? { period: { from: input.from, to: input.to } } : {}),
            filters: {
              ...(input.accountName ? { accountName: input.accountName } : {}),
              ...(input.categoryName ? { categoryName: input.categoryName } : {}),
            },
            recordCount: 0,
          },
        );
      }
      const page = await transactions.list(context.env, context.tenantId, {
        page: input.page,
        pageSize: 25,
        sortBy: "date",
        sortDirection: "desc",
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(accountId ? { accountId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(input.search ? { search: input.search } : {}),
      });
      return source(
        {
          items: page.items.map((item) => ({
            date: item.date,
            description: compactDescription(item.description),
            amount: formatMoney(item.amountMinor),
            currency: item.currency,
            kind: item.kind,
            categoryName: item.categoryName,
            accountName:
              item.kind === "transfer" && item.fromAccountName && item.toAccountName
                ? `${item.fromAccountName} → ${item.toAccountName}`
                : item.accountName,
          })),
          page: page.page,
          total: page.total,
          totalPages: page.totalPages,
          filterMatched: true,
        },
        "transactions",
        {
          ...(input.from && input.to ? { period: { from: input.from, to: input.to } } : {}),
          filters: {
            ...(input.accountName ? { accountName: input.accountName } : {}),
            ...(input.categoryName ? { categoryName: input.categoryName } : {}),
          },
          recordCount: page.items.length,
          quality:
            page.total > page.items.length
              ? {
                  status: "limited",
                  signals: [
                    {
                      code: "bounded_transaction_page",
                      message: "Only a bounded page of matching transaction details is shown.",
                      count: page.items.length,
                    },
                  ],
                }
              : { status: "reliable", signals: [] },
        },
      );
    },

    async listCategories(context, kind) {
      const items = await categories.list(context.env, context.tenantId);
      const filtered = items
        .filter((item) => !kind || item.kind === kind)
        .map((item) => ({ name: item.name, kind: item.kind }));
      return source({ items: filtered }, "transactions", { recordCount: filtered.length });
    },
  };
}

export const financialReader = createFinancialReader();
