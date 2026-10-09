import {
  calculateDebtPayoff,
  calculateSavingsGoal,
  countsAsIncome,
  decimalAmountToMinor,
  detectRecurringCharges,
  detectSpendingAnomalies,
  summarizeAccountBalances,
  type AssistantToolResultEnvelope,
  type Currency,
  type DashboardSummary,
  type AssistantActionToolInput,
  type DebtProjectionInput,
  type TransactionKind,
} from "@zoption/shared";

import { accountRepository, type AccountRepository } from "../db/accounts";
import { budgetRepository, type BudgetRepository } from "../db/budgets";
import { categoryRepository, type CategoryRepository } from "../db/categories";
import { debtRepository, type DebtRepository } from "../db/debts";
import { loadDashboard } from "../db/dashboard";
import { financialGoalRepository, type FinancialGoalRepository } from "../db/goals";
import { subscriptionRepository, type SubscriptionRepository } from "../db/subscriptions";
import { transactionRepository, type TransactionRepository } from "../db/transactions";
import { loadWorkspaceCurrency } from "../db/workspace-settings";
import type { Bindings } from "../types";
import {
  assessTransactionDataQuality,
  type AssistantAnalysisTransaction,
  type DataQualityAssessment,
} from "./data-quality";
import {
  coveredMonthCount,
  daysInclusive,
  monthEnd,
  shiftDays,
  shiftMonths,
} from "./calendar-math";
import { loadAndProposeAction, type ActionProposal } from "./actions";
import {
  compactDescription,
  findAccountByName,
  formatMoney,
  normalizedName,
} from "./record-format";
import {
  draftTransaction,
  entryHistoryFrom,
  loadEntryHistory,
  suggestTransactionDetails,
  type EntryHistoryLoader,
  type TransactionDraftInput,
  type TransactionDraftResult,
  type TransactionSuggestionInput,
} from "./transaction-entry";

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
  suggestTransactionDetails(
    context: FinancialReadContext,
    input: TransactionSuggestionInput,
  ): Promise<AssistantToolResultEnvelope<unknown>>;
  draftTransaction(
    context: FinancialReadContext,
    input: TransactionDraftInput,
  ): Promise<TransactionDraftResult>;
  proposeAction(
    context: FinancialReadContext,
    input: AssistantActionToolInput,
  ): Promise<ActionProposal>;
}

type DashboardPeriod = Pick<PeriodSummaryInput, "from" | "to">;
type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: DashboardPeriod,
  accountId?: string,
  currency?: Currency,
) => Promise<DashboardSummary>;
type WorkspaceCurrencyLoader = (env: Bindings, tenantId: string) => Promise<Currency>;

interface AnalysisTransaction extends AssistantAnalysisTransaction {
  categoryId: string;
  accountId: string | null;
  currency: Currency;
  categorySystemKey?: string | null;
}

type AnalysisLoader = (
  context: FinancialReadContext,
  from: string,
  to: string,
  accountId?: string,
) => Promise<AnalysisTransaction[]>;

const MAX_ANALYSIS_TRANSACTIONS = 5_000;
/**
 * Aggregates count only the workspace currency and never convert, matching the dashboard and
 * plans. `excludedCount` counts the other currency's rows a tool would have summed (expenses
 * by default) so the model can say they were left out.
 */
function splitByCurrency(
  rows: readonly AnalysisTransaction[],
  currency: Currency,
  summed: (item: AnalysisTransaction) => boolean = (item) => item.kind === "expense",
) {
  const included = rows.filter((item) => item.currency === currency);
  const excludedCount = rows.filter((item) => item.currency !== currency && summed(item)).length;
  return { rows: included, excludedCount };
}

function assessWorkspaceQuality(
  rows: readonly AnalysisTransaction[],
  excludedCount: number,
  period: { from: string; to: string },
  currency: Currency,
): DataQualityAssessment {
  const quality = assessTransactionDataQuality(rows, period);
  if (excludedCount === 0) return quality;
  quality.signals.push({
    code: "other_currency_excluded",
    message: `Totals count only ${currency}, the workspace currency; transactions in other currencies were left out and not converted.`,
    count: excludedCount,
  });
  if (quality.status === "reliable") quality.status = "limited";
  return quality;
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
    quality?: DataQualityAssessment;
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
            c.system_key AS categorySystemKey,
            t.account_id AS accountId, COALESCE(a.name, 'Unassigned') AS accountName,
            t.currency, t.source_kind AS sourceKind, t.import_id AS importId
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
    subscriptions?: SubscriptionRepository;
    transactions?: TransactionRepository;
    dashboardLoader?: DashboardLoader;
    analysisLoader?: AnalysisLoader;
    entryHistoryLoader?: EntryHistoryLoader;
    workspaceCurrencyLoader?: WorkspaceCurrencyLoader;
  } = {},
): FinancialReader {
  const accounts = options.accounts ?? accountRepository;
  const budgets = options.budgets ?? budgetRepository;
  const categories = options.categories ?? categoryRepository;
  const debts = options.debts ?? debtRepository;
  const goals = options.goals ?? financialGoalRepository;
  const subscriptions = options.subscriptions ?? subscriptionRepository;
  const transactions = options.transactions ?? transactionRepository;
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const analysisLoader = options.analysisLoader ?? loadAnalysisTransactions;
  const entryHistoryLoader = options.entryHistoryLoader ?? loadEntryHistory;
  const workspaceCurrencyLoader = options.workspaceCurrencyLoader ?? loadWorkspaceCurrency;

  async function loadWorkspaceAnalysis(
    context: FinancialReadContext,
    from: string,
    to: string,
    accountId?: string,
  ) {
    const [currency, analysis] = await Promise.all([
      workspaceCurrencyLoader(context.env, context.tenantId),
      analysisLoader(context, from, to, accountId),
    ]);
    return { currency, ...splitByCurrency(analysis, currency) };
  }

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
      const [accountItems, currency] = await Promise.all([
        accounts.list(context.env, context.tenantId),
        workspaceCurrencyLoader(context.env, context.tenantId),
      ]);
      const account = input.accountName
        ? findAccountByName(accountItems, input.accountName)
        : undefined;
      if (input.accountName && !account) {
        return source({ accountName: input.accountName, filterMatched: false }, "accounts", {
          filters: { accountName: input.accountName },
        });
      }

      const summary = summarizeAccountBalances(account ? [account] : accountItems, currency);
      return source(
        {
          ...(account ? { accountName: account.name, filterMatched: true } : {}),
          currency: summary.currency,
          overallBalance: formatMoney(summary.overallBalanceMinor, summary.currency),
          items: summary.items.map((item) => ({
            name: item.name,
            type: item.type,
            balance: formatMoney(item.balanceMinor, item.currency),
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

      const currencyLoad = workspaceCurrencyLoader(context.env, context.tenantId);
      const [currency, allAnalysis, summary] = await Promise.all([
        currencyLoad,
        analysisLoader(context, input.from, input.to, account?.id),
        currencyLoad.then((currency) =>
          dashboardLoader(
            context.env,
            context.tenantId,
            { from: input.from, to: input.to },
            account?.id,
            currency,
          ),
        ),
      ]);
      // The summary totals income and expenses, so both count toward what was left out. An
      // opening balance is never counted as income, so leaving one out is not reported.
      const { rows: analysis, excludedCount } = splitByCurrency(
        allAnalysis,
        currency,
        (item) => item.kind === "expense" || countsAsIncome(item),
      );
      const monthCount = coveredMonthCount(input.from, input.to);
      const quality = assessWorkspaceQuality(analysis, excludedCount, input, currency);
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
          currency,
          income: formatMoney(summary.metrics.moneyInMinor, currency),
          expenses: formatMoney(summary.metrics.moneyOutMinor, currency),
          net: formatMoney(summary.metrics.netMinor, currency),
          monthlyAverages: {
            coveredMonthCount: monthCount,
            includesZeroTransactionMonths: true,
            income: formatMoney(Math.round(summary.metrics.moneyInMinor / monthCount), currency),
            expenses: formatMoney(Math.round(summary.metrics.moneyOutMinor / monthCount), currency),
            net: formatMoney(Math.round(summary.metrics.netMinor / monthCount), currency),
          },
          savingsRatePercent: summary.insights.savingsRatePercent,
          spendingByCategory: summary.spendingByCategory.map((item) => ({
            name: item.name,
            amount: formatMoney(item.amountMinor, currency),
            sharePercent: item.sharePercent,
          })),
          monthlyTrend:
            monthCount > 24
              ? []
              : summary.monthlyTrend
                  .filter((item) => item.month >= periodStartMonth && item.month <= periodEndMonth)
                  .map((item) => ({
                    month: item.month,
                    income: formatMoney(item.incomeMinor, currency),
                    expenses: formatMoney(item.expenseMinor, currency),
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
      const [{ currency, rows: analysis, excludedCount }, categoryItems] = await Promise.all([
        loadWorkspaceAnalysis(context, input.from, input.to),
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
        // Largest spend first: "biggest expense" answers read the top item.
        .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name))
        .map((item) => ({
          name: item.name,
          amount: formatMoney(item.amountMinor, currency),
          transactionCount: item.count,
          sharePercent:
            totalMinor === 0 ? 0 : Math.round((item.amountMinor / totalMinor) * 1_000) / 10,
        }));
      return source(
        {
          ...(category ? { categoryName: category.name, filterMatched: true } : {}),
          period: input,
          total: formatMoney(totalMinor, currency),
          items,
        },
        "transactions",
        {
          period: input,
          ...(category ? { filters: { categoryName: category.name } } : {}),
          recordCount: expenses.length,
          quality: assessWorkspaceQuality(analysis, excludedCount, input, currency),
        },
      );
    },

    async getBudgetVsActual(context, input) {
      const months = budgetMonths(input.from, input.to);
      const [{ currency, rows: analysis, excludedCount }, plans] = await Promise.all([
        loadWorkspaceAnalysis(context, input.from, input.to),
        Promise.all(
          months.map(async (month) => ({
            month,
            plan: await budgets.get(context.env, context.tenantId, { scope: "month", month }),
          })),
        ),
      ]);
      let totalBudgetedSpentMinor = 0;
      const resultMonths = plans.map(({ month, plan }) => {
        const monthKey = month.slice(0, 7);
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
        // A category with no limit is not budgeted: its spending stays visible as actual
        // spending but never counts against the plan (docs/maintainability.md).
        const limitMinor = plan.items.reduce((sum, item) => sum + item.limitMinor, 0);
        const budgetedSpentMinor = plan.items.reduce(
          (sum, item) => sum + (item.limitMinor > 0 ? (spending.get(item.categoryId) ?? 0) : 0),
          0,
        );
        const items = plan.items
          .filter((item) => item.limitMinor !== 0 || (spending.get(item.categoryId) ?? 0) !== 0)
          .map((item) => {
            const spentMinor = spending.get(item.categoryId) ?? 0;
            const hasLimit = item.limitMinor > 0;
            return {
              name: item.categoryName,
              limit: formatMoney(item.limitMinor, currency),
              spent: formatMoney(spentMinor, currency),
              remaining: formatMoney(hasLimit ? item.limitMinor - spentMinor : 0, currency),
              usedPercent: hasLimit ? Math.round((spentMinor / item.limitMinor) * 1_000) / 10 : 0,
            };
          });
        const spentMinor = monthExpenses.reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
        const fullMonth = input.from <= month && input.to >= monthEnd(month);
        totalBudgetedSpentMinor += budgetedSpentMinor;
        return {
          month: month,
          coverage: fullMonth ? "full_month" : "partial_month",
          limit: formatMoney(limitMinor, currency),
          spent: formatMoney(spentMinor, currency),
          remaining: formatMoney(limitMinor - budgetedSpentMinor, currency),
          usedPercent:
            limitMinor === 0 ? 0 : Math.round((budgetedSpentMinor / limitMinor) * 1_000) / 10,
          hasBudget: limitMinor > 0,
          items,
        };
      });
      const totalLimitMinor = plans.reduce(
        (sum, { plan }) =>
          sum + plan.items.reduce((monthSum, item) => monthSum + item.limitMinor, 0),
        0,
      );
      const totalSpentMinor = analysis
        .filter((item) => item.kind === "expense")
        .reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
      return source(
        {
          period: input,
          totalLimit: formatMoney(totalLimitMinor, currency),
          totalSpent: formatMoney(totalSpentMinor, currency),
          remaining: formatMoney(totalLimitMinor - totalBudgetedSpentMinor, currency),
          usedPercent:
            totalLimitMinor === 0
              ? 0
              : Math.round((totalBudgetedSpentMinor / totalLimitMinor) * 1_000) / 10,
          months: resultMonths,
        },
        "budgets",
        {
          period: input,
          recordCount: analysis.length,
          quality: assessWorkspaceQuality(analysis, excludedCount, input, currency),
        },
      );
    },

    async getBudgetStatus(context, month) {
      return this.getBudgetVsActual(context, { from: month, to: monthEnd(month) });
    },

    async detectRecurringCharges(context, through) {
      const from = shiftMonths(through, -11);
      const {
        currency,
        rows: analysis,
        excludedCount,
      } = await loadWorkspaceAnalysis(context, from, through);
      const expenses = analysis.filter((item) => item.kind === "expense");
      const items = detectRecurringCharges(expenses).map((item) => ({
        description: item.description,
        categoryName: item.categoryName,
        occurrenceDates: item.occurrenceDates,
        occurrenceCount: item.occurrenceCount,
        cadence: item.cadence,
        typicalAmount: formatMoney(item.typicalAmountMinor, currency),
        latestAmount: formatMoney(item.latestAmountMinor, currency),
        lowestAmount: formatMoney(item.lowestAmountMinor, currency),
        highestAmount: formatMoney(item.highestAmountMinor, currency),
        priceChange: formatMoney(item.priceChangeMinor, currency),
        priceChangePercent: item.priceChangePercent,
        confidence: item.confidence,
      }));
      return source({ analyzedWindow: { from, to: through }, items }, "transactions", {
        period: { from, to: through },
        recordCount: expenses.length,
        quality: assessWorkspaceQuality(analysis, excludedCount, { from, to: through }, currency),
      });
    },

    async detectSpendingAnomalies(context, input) {
      const duration = daysInclusive(input.from, input.to);
      if (duration > 366) throw new Error("Choose an anomaly period of 366 days or less.");
      const baselineTo = shiftDays(input.from, -1);
      const baselineFrom = shiftDays(baselineTo, -(duration * 6 - 1));
      const [currency, allRequested, allBaseline] = await Promise.all([
        workspaceCurrencyLoader(context.env, context.tenantId),
        analysisLoader(context, input.from, input.to),
        analysisLoader(context, baselineFrom, baselineTo),
      ]);
      const { rows: requested, excludedCount } = splitByCurrency(allRequested, currency);
      const { rows: baseline } = splitByCurrency(allBaseline, currency);
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
      const quality = assessWorkspaceQuality(requested, excludedCount, input, currency);
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
            amount: formatMoney(item.amountMinor, currency),
            baselineMedian: formatMoney(item.baselineMedianMinor, currency),
            reason: item.reason,
          })),
          categorySpikes: result.categorySpikes.map((item) => ({
            categoryName: item.categoryName,
            requestedTotal: formatMoney(item.requestedTotalMinor, currency),
            baselineMedian: formatMoney(item.baselineMedianMinor, currency),
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
      // Saved debts and goals carry no currency of their own; they are in the workspace currency.
      const currency = await workspaceCurrencyLoader(context.env, context.tenantId);
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
          totalInterest: formatMoney(result.totalInterestMinor, currency),
          totalPaid: formatMoney(result.totalPaidMinor, currency),
          monthlyBudget: formatMoney(result.monthlyBudgetMinor, currency),
          payoffOrder: result.payoffOrder,
          schedule: schedule.map((item) => ({
            month: item.month,
            date: item.date,
            payment: formatMoney(item.paymentMinor, currency),
            interest: formatMoney(item.interestMinor, currency),
            remaining: formatMoney(item.remainingMinor, currency),
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
      const currency = await workspaceCurrencyLoader(context.env, context.tenantId);
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
          targetAmount: formatMoney(result.targetAmountMinor, currency),
          currentSaved: formatMoney(result.currentSavedMinor, currency),
          remaining: formatMoney(result.remainingMinor, currency),
          targetDate: result.targetDate,
          contributionMonths: result.contributionMonths,
          requiredMonthly:
            result.requiredMonthlyMinor === null
              ? null
              : formatMoney(result.requiredMonthlyMinor, currency),
          amountDueNow: formatMoney(result.amountDueNowMinor, currency),
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
            amount: formatMoney(item.amountMinor, item.currency),
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

    async suggestTransactionDetails(context, input) {
      const [history, accountItems, categoryItems] = await Promise.all([
        entryHistoryLoader(context, input.kind, entryHistoryFrom(input.through), input.through),
        accounts.list(context.env, context.tenantId),
        categories.list(context.env, context.tenantId),
      ]);
      return suggestTransactionDetails(input, history, accountItems, categoryItems);
    },

    async draftTransaction(context, input) {
      const [accountItems, categoryItems] = await Promise.all([
        accounts.list(context.env, context.tenantId),
        categories.list(context.env, context.tenantId),
      ]);
      return draftTransaction(input, accountItems, categoryItems);
    },

    proposeAction(context, input) {
      return loadAndProposeAction(
        { accounts, categories, goals, debts, subscriptions, transactions },
        context,
        input,
        workspaceCurrencyLoader,
      );
    },
  };
}
