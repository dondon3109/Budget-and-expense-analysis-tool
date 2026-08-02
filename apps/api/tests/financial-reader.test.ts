import type {
  AccountRecord,
  BudgetMonthPlan,
  CategoryRecord,
  DashboardSummary,
  TransactionCalendarMonth,
  TransactionListItem,
  TransactionPage,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createFinancialReader } from "../src/assistant/financial-reader";
import type { AccountRepository } from "../src/db/accounts";
import type { BudgetRepository } from "../src/db/budgets";
import type { CategoryRepository } from "../src/db/categories";
import type { TransactionRepository } from "../src/db/transactions";
import type { Bindings } from "../src/types";

const env = { DB: {} as D1Database } satisfies Bindings;
const context = { env, tenantId: "tenant-1" };

const savingsAccount: AccountRecord = {
  id: "account-1",
  name: "Savings",
  type: "savings",
  currency: "PHP",
  balanceMinor: 123_456,
  balanceAsOf: "2026-07-27",
  archived: false,
};
const creditAccount: AccountRecord = {
  id: "account-2",
  name: "Credit card",
  type: "credit",
  currency: "PHP",
  balanceMinor: 45_600,
  balanceAsOf: "2026-07-27",
  archived: false,
};
const category: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
  system: false,
  origin: "custom",
  requiredPlan: "free",
  locked: false,
};
const transaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-27",
  description: "Groceries",
  amountMinor: -69_600,
  currency: "PHP",
  kind: "expense",
  categoryId: category.id,
  categoryName: category.name,
  categoryColor: category.color,
  accountId: savingsAccount.id,
  accountName: savingsAccount.name,
  notes: null,
};
const transactionPage: TransactionPage = {
  items: [transaction],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
};
const transactionCalendar: TransactionCalendarMonth = {
  month: "2026-07-01",
  currency: "PHP",
  items: [transaction],
  hasAnyTransactions: true,
};
const budgetPlan: BudgetMonthPlan = {
  month: "2026-07-01",
  currency: "PHP",
  totalLimitMinor: 100_000,
  totalSpentMinor: 69_600,
  remainingMinor: 30_400,
  usedPercent: 69.6,
  items: [
    {
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      limitMinor: 100_000,
      spentMinor: 69_600,
      remainingMinor: 30_400,
      usedPercent: 69.6,
    },
  ],
};
const dashboardSummary: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  metrics: {
    moneyInMinor: 100_000,
    moneyOutMinor: 69_600,
    netMinor: 30_400,
    budgetLimitMinor: 100_000,
    remainingBudgetMinor: 30_400,
    budgetUsedPercent: 69.6,
  },
  spendingByCategory: [
    {
      categoryId: category.id,
      name: category.name,
      color: category.color,
      amountMinor: 69_600,
      sharePercent: 100,
    },
  ],
  monthlyTrend: [{ month: "2026-07", incomeMinor: 100_000, expenseMinor: 69_600 }],
  budgetProgress: [],
  insights: {
    savingsMinor: 30_400,
    savingsRatePercent: 30.4,
    recurringExpenses: [
      {
        description: "Internet",
        categoryName: "Utilities",
        averageMinor: 12_345,
        occurrenceCount: 3,
        latestMonth: "2026-07",
      },
    ],
  },
};

function createReader(
  options: { accountItems?: AccountRecord[]; summary?: DashboardSummary } = {},
) {
  const accounts: AccountRepository = {
    list: vi.fn(async () => options.accountItems ?? [savingsAccount, creditAccount]),
    setBalance: vi.fn(async () => savingsAccount),
  };
  const budgets: BudgetRepository = {
    list: vi.fn(async () => budgetPlan),
    upsert: vi.fn(async () => budgetPlan),
  };
  const categories: CategoryRepository = {
    list: vi.fn(async () => [category]),
    create: vi.fn(async () => category),
    update: vi.fn(async () => category),
  };
  const transactions: TransactionRepository = {
    list: vi.fn(async () => transactionPage),
    calendar: vi.fn(async () => transactionCalendar),
    create: vi.fn(async () => transaction),
    update: vi.fn(async () => transaction),
    remove: vi.fn(async () => undefined),
    export: vi.fn(async () => [transaction]),
  };
  const dashboardLoader = vi.fn(async () => options.summary ?? dashboardSummary);
  const analysisLoader = vi.fn(async () => [
    {
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      amountMinor: transaction.amountMinor,
      kind: transaction.kind,
      categoryId: transaction.categoryId,
      categoryName: transaction.categoryName,
      accountId: transaction.accountId,
      accountName: transaction.accountName,
      sourceKind: "manual" as const,
      importId: null,
    },
  ]);
  return {
    reader: createFinancialReader({
      accounts,
      budgets,
      categories,
      transactions,
      dashboardLoader,
      analysisLoader,
    }),
    accounts,
    dashboardLoader,
  };
}

describe("assistant financial reader money formatting", () => {
  it("returns backend-formatted PHP strings instead of model-scaled minor units", async () => {
    const { reader } = createReader();
    const balances = await reader.getAccountBalances(context);
    const period = await reader.getPeriodSummary(context, dashboardSummary.period);
    const budget = await reader.getBudgetStatus(context, "2026-07-01");
    const transactions = await reader.listTransactions(context, { page: 1 });

    expect(balances.data).toMatchObject({
      overallBalance: "PHP 1,690.56",
      items: [
        { name: "Savings", balance: "PHP 1,234.56" },
        { name: "Credit card", balance: "PHP 456.00" },
      ],
    });
    expect(period.data).toMatchObject({
      income: "PHP 1,000.00",
      expenses: "PHP 696.00",
      net: "PHP 304.00",
      monthlyAverages: {
        coveredMonthCount: 1,
        includesZeroTransactionMonths: true,
        income: "PHP 1,000.00",
        expenses: "PHP 696.00",
        net: "PHP 304.00",
      },
      spendingByCategory: [{ amount: "PHP 696.00" }],
      monthlyTrend: [{ income: "PHP 1,000.00", expenses: "PHP 696.00" }],
    });
    expect(budget.data).toMatchObject({
      totalLimit: "PHP 1,000.00",
      totalSpent: "PHP 696.00",
      remaining: "PHP 304.00",
      months: [
        {
          items: [{ limit: "PHP 1,000.00", spent: "PHP 696.00", remaining: "PHP 304.00" }],
        },
      ],
    });
    expect(transactions.data).toMatchObject({ items: [{ amount: "PHP -696.00" }] });
    expect(JSON.stringify({ balances, period, budget, transactions })).not.toContain("Minor");
  });

  it("calculates averages across every covered calendar month with centavo rounding", async () => {
    const summary: DashboardSummary = {
      ...dashboardSummary,
      period: { from: "2026-01-01", to: "2026-03-31" },
      metrics: {
        ...dashboardSummary.metrics,
        moneyInMinor: 100_001,
        moneyOutMinor: 50_000,
        netMinor: 50_001,
      },
      monthlyTrend: [
        { month: "2026-01", incomeMinor: 100_001, expenseMinor: 0 },
        { month: "2026-03", incomeMinor: 0, expenseMinor: 50_000 },
      ],
    };
    const { reader } = createReader({ summary });

    const period = await reader.getPeriodSummary(context, summary.period);

    expect(period.data).toMatchObject({
      income: "PHP 1,000.01",
      expenses: "PHP 500.00",
      net: "PHP 500.01",
      monthlyAverages: {
        coveredMonthCount: 3,
        includesZeroTransactionMonths: true,
        income: "PHP 333.34",
        expenses: "PHP 166.67",
        net: "PHP 166.67",
      },
    });
  });
});

// Account-name filters are resolved only against the current tenant's repository results.
describe("assistant financial reader account filters", () => {
  it("returns a canonical, single-account balance without exposing its internal identifier", async () => {
    const { reader, accounts } = createReader();

    const result = await reader.getAccountBalances(context, { accountName: "sAvInGs" });

    expect(result.data).toMatchObject({
      accountName: "Savings",
      filterMatched: true,
      overallBalance: "PHP 1,234.56",
      items: [{ name: "Savings", balance: "PHP 1,234.56" }],
    });
    expect(JSON.stringify(result)).not.toContain(savingsAccount.id);
    expect(accounts.list).toHaveBeenCalledWith(env, "tenant-1");
  });

  it("uses a tenant-resolved account identifier only in the aggregate loader", async () => {
    const { reader, dashboardLoader } = createReader();

    const result = await reader.getPeriodSummary(context, {
      from: "2026-07-01",
      to: "2026-07-31",
      accountName: "SAVINGS",
    });

    expect(result.data).toMatchObject({
      accountName: "Savings",
      filterMatched: true,
      expenses: "PHP 696.00",
    });
    expect(dashboardLoader).toHaveBeenCalledWith(
      env,
      "tenant-1",
      { from: "2026-07-01", to: "2026-07-31" },
      savingsAccount.id,
    );
    expect(JSON.stringify(result)).not.toContain(savingsAccount.id);
  });

  it("resolves a trailing generic account suffix to a canonical account name", async () => {
    const bankAccount: AccountRecord = {
      ...savingsAccount,
      id: "account-bank",
      name: "Bank",
    };
    const { reader, dashboardLoader } = createReader({ accountItems: [bankAccount] });

    const result = await reader.getPeriodSummary(context, {
      from: "2026-07-01",
      to: "2026-07-31",
      accountName: "bank account",
    });

    expect(result.data).toMatchObject({ accountName: "Bank", filterMatched: true });
    expect(dashboardLoader).toHaveBeenCalledWith(
      env,
      "tenant-1",
      { from: "2026-07-01", to: "2026-07-31" },
      bankAccount.id,
    );
  });

  it("prefers an exact account name before removing the generic suffix", async () => {
    const bankAccount: AccountRecord = {
      ...savingsAccount,
      id: "account-bank",
      name: "Bank",
    };
    const customBankAccount: AccountRecord = {
      ...savingsAccount,
      id: "account-custom-bank",
      name: "Bank Account",
    };
    const { reader, dashboardLoader } = createReader({
      accountItems: [bankAccount, customBankAccount],
    });

    const result = await reader.getPeriodSummary(context, {
      from: "2026-07-01",
      to: "2026-07-31",
      accountName: "bank account",
    });

    expect(result.data).toMatchObject({ accountName: "Bank Account", filterMatched: true });
    expect(dashboardLoader).toHaveBeenCalledWith(
      env,
      "tenant-1",
      { from: "2026-07-01", to: "2026-07-31" },
      customBankAccount.id,
    );
  });

  it("returns no balances or totals when the named account is not in the tenant", async () => {
    const { reader, dashboardLoader } = createReader();

    await expect(
      reader.getAccountBalances(context, { accountName: "Unknown" }),
    ).resolves.toMatchObject({ data: { accountName: "Unknown", filterMatched: false } });
    await expect(
      reader.getPeriodSummary(context, {
        from: "2026-07-01",
        to: "2026-07-31",
        accountName: "Unknown",
      }),
    ).resolves.toMatchObject({ data: { accountName: "Unknown", filterMatched: false } });
    expect(dashboardLoader).not.toHaveBeenCalled();
  });
});
