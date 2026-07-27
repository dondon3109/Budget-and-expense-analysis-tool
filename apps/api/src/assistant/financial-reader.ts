import {
  summarizeAccountBalances,
  type DashboardSummary,
  type TransactionKind,
} from "@zoption/shared";

import { accountRepository, type AccountRepository } from "../db/accounts";
import { budgetRepository, type BudgetRepository } from "../db/budgets";
import { categoryRepository, type CategoryRepository } from "../db/categories";
import { loadDashboard } from "../db/dashboard";
import { transactionRepository, type TransactionRepository } from "../db/transactions";
import type { Bindings } from "../types";

export interface FinancialReadContext {
  env: Bindings;
  tenantId: string;
}

export interface PeriodSummaryInput {
  from: string;
  to: string;
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
  getAccountBalances(context: FinancialReadContext): Promise<unknown>;
  getPeriodSummary(context: FinancialReadContext, input: PeriodSummaryInput): Promise<unknown>;
  getBudgetStatus(context: FinancialReadContext, month: string): Promise<unknown>;
  listTransactions(context: FinancialReadContext, input: TransactionReadInput): Promise<unknown>;
  listCategories(context: FinancialReadContext, kind?: TransactionKind): Promise<unknown>;
}

type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: PeriodSummaryInput,
) => Promise<DashboardSummary>;

function differenceInMonths(from: string, to: string): number {
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5, 7));
  const toYear = Number(to.slice(0, 4));
  const toMonth = Number(to.slice(5, 7));
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

function compactDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117).trimEnd()}…`;
}

export function createFinancialReader(
  options: {
    accounts?: AccountRepository;
    budgets?: BudgetRepository;
    categories?: CategoryRepository;
    transactions?: TransactionRepository;
    dashboardLoader?: DashboardLoader;
  } = {},
): FinancialReader {
  const accounts = options.accounts ?? accountRepository;
  const budgets = options.budgets ?? budgetRepository;
  const categories = options.categories ?? categoryRepository;
  const transactions = options.transactions ?? transactionRepository;
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;

  return {
    async getAccountBalances(context) {
      return summarizeAccountBalances(await accounts.list(context.env, context.tenantId));
    },

    async getPeriodSummary(context, input) {
      if (differenceInMonths(input.from, input.to) > 24) {
        throw new Error("Choose a date range of 24 months or less.");
      }
      const summary = await dashboardLoader(context.env, context.tenantId, input);
      return {
        period: summary.period,
        currency: summary.currency,
        incomeMinor: summary.metrics.moneyInMinor,
        expensesMinor: summary.metrics.moneyOutMinor,
        netMinor: summary.metrics.netMinor,
        savingsRatePercent: summary.insights.savingsRatePercent,
        spendingByCategory: summary.spendingByCategory.map((item) => ({
          name: item.name,
          amountMinor: item.amountMinor,
          sharePercent: item.sharePercent,
        })),
        monthlyTrend: summary.monthlyTrend,
        recurringExpenses: summary.insights.recurringExpenses,
      };
    },

    async getBudgetStatus(context, month) {
      const plan = await budgets.list(context.env, context.tenantId, month);
      return {
        month: plan.month,
        currency: plan.currency,
        totalLimitMinor: plan.totalLimitMinor,
        totalSpentMinor: plan.totalSpentMinor,
        remainingMinor: plan.remainingMinor,
        usedPercent: plan.usedPercent,
        items: plan.items
          .filter((item) => item.limitMinor > 0 || item.spentMinor > 0)
          .map((item) => ({
            name: item.categoryName,
            limitMinor: item.limitMinor,
            spentMinor: item.spentMinor,
            remainingMinor: item.remainingMinor,
            usedPercent: item.usedPercent,
          })),
      };
    },

    async listTransactions(context, input) {
      const [accountItems, categoryItems] = await Promise.all([
        input.accountName ? accounts.list(context.env, context.tenantId) : Promise.resolve([]),
        input.categoryName ? categories.list(context.env, context.tenantId) : Promise.resolve([]),
      ]);
      const accountId = input.accountName
        ? accountItems.find(
            (account) =>
              account.name.toLocaleLowerCase("en") === input.accountName!.toLocaleLowerCase("en"),
          )?.id
        : undefined;
      const categoryId = input.categoryName
        ? categoryItems.find(
            (category) =>
              category.name.toLocaleLowerCase("en") === input.categoryName!.toLocaleLowerCase("en"),
          )?.id
        : undefined;
      if ((input.accountName && !accountId) || (input.categoryName && !categoryId)) {
        return { items: [], page: input.page, total: 0, totalPages: 1, filterMatched: false };
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
      return {
        items: page.items.map((item) => ({
          date: item.date,
          description: compactDescription(item.description),
          amountMinor: item.amountMinor,
          currency: item.currency,
          kind: item.kind,
          categoryName: item.categoryName,
          accountName: item.accountName,
        })),
        page: page.page,
        total: page.total,
        totalPages: page.totalPages,
        filterMatched: true,
      };
    },

    async listCategories(context, kind) {
      const items = await categories.list(context.env, context.tenantId);
      return {
        items: items
          .filter((item) => !kind || item.kind === kind)
          .map((item) => ({ name: item.name, kind: item.kind })),
      };
    },
  };
}

export const financialReader = createFinancialReader();
