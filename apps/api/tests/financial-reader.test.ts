import {
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  type AccountRecord,
  type BudgetMonthPlan,
  type CategoryRecord,
  type Currency,
  type DashboardSummary,
  type TransactionCalendarMonth,
  type TransactionListItem,
  type TransactionPage,
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
    incomeByCurrency: { PHP: 100_000, USD: 0 },
    expenseByCurrency: { PHP: 69_600, USD: 0 },
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

interface AnalysisRow {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  kind: "income" | "expense" | "transfer";
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  accountName: string;
  sourceKind: "manual" | "import";
  importId: string | null;
  categorySystemKey?: string | null;
}

const analysisRow: AnalysisRow = {
  id: transaction.id,
  date: transaction.date,
  description: transaction.description,
  amountMinor: transaction.amountMinor,
  currency: "PHP",
  kind: transaction.kind,
  categoryId: transaction.categoryId,
  categoryName: transaction.categoryName,
  accountId: transaction.accountId,
  accountName: transaction.accountName,
  sourceKind: "manual",
  importId: null,
};

function createReader(
  options: {
    accountItems?: AccountRecord[];
    summary?: DashboardSummary;
    plan?: BudgetMonthPlan;
    transactionItems?: TransactionListItem[];
    analysisRows?: AnalysisRow[];
    workspaceCurrency?: Currency;
  } = {},
) {
  const accounts: AccountRepository = {
    list: vi.fn(async () => options.accountItems ?? [savingsAccount, creditAccount]),
    setBalance: vi.fn(async () => savingsAccount),
  };
  const budgets: BudgetRepository = {
    list: vi.fn(async () => options.plan ?? budgetPlan),
    upsert: vi.fn(async () => options.plan ?? budgetPlan),
  };
  const categories: CategoryRepository = {
    list: vi.fn(async () => [category]),
    create: vi.fn(async () => category),
    update: vi.fn(async () => category),
  };
  const transactions: TransactionRepository = {
    list: vi.fn(async () =>
      options.transactionItems
        ? {
            ...transactionPage,
            items: options.transactionItems,
            total: options.transactionItems.length,
          }
        : transactionPage,
    ),
    calendar: vi.fn(async () => transactionCalendar),
    create: vi.fn(async () => transaction),
    update: vi.fn(async () => transaction),
    remove: vi.fn(async () => undefined),
    export: vi.fn(async () => [transaction]),
  };
  const dashboardLoader = vi.fn(async () => options.summary ?? dashboardSummary);
  const analysisLoader = vi.fn(async (_context: unknown, from: string, to: string) =>
    (options.analysisRows ?? [analysisRow]).filter((row) => row.date >= from && row.date <= to),
  );
  const workspaceCurrencyLoader = vi.fn(async () => options.workspaceCurrency ?? "PHP");
  return {
    reader: createFinancialReader({
      accounts,
      budgets,
      categories,
      transactions,
      dashboardLoader,
      analysisLoader,
      workspaceCurrencyLoader,
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

describe("assistant financial reader ordering and currencies", () => {
  it("lists category spending largest first, not most frequent first", async () => {
    const { reader } = createReader({
      analysisRows: [
        {
          ...analysisRow,
          id: "c1",
          categoryId: "coffee",
          categoryName: "Coffee",
          amountMinor: -15_000,
        },
        {
          ...analysisRow,
          id: "c2",
          categoryId: "coffee",
          categoryName: "Coffee",
          amountMinor: -15_000,
        },
        {
          ...analysisRow,
          id: "c3",
          categoryId: "coffee",
          categoryName: "Coffee",
          amountMinor: -15_000,
        },
        {
          ...analysisRow,
          id: "r1",
          categoryId: "rent",
          categoryName: "Rent",
          amountMinor: -1_200_000,
        },
      ],
    });

    const result = await reader.getSpendingByCategory(context, dashboardSummary.period);

    expect(
      (result.data as { items: Array<{ name: string }> }).items.map((item) => item.name),
    ).toEqual(["Rent", "Coffee"]);
  });

  it("labels a listed USD transaction in USD", async () => {
    const { reader } = createReader({
      transactionItems: [{ ...transaction, amountMinor: -1_250, currency: "USD" }],
    });

    const transactions = await reader.listTransactions(context, { page: 1 });

    expect(transactions.data).toMatchObject({ items: [{ amount: "USD -12.50" }] });
  });
});

describe("assistant financial reader budget plan scope", () => {
  it("keeps the plan at zero when no category carries a limit", async () => {
    const { reader } = createReader({
      plan: {
        ...budgetPlan,
        totalLimitMinor: 0,
        totalSpentMinor: 0,
        remainingMinor: 0,
        usedPercent: 0,
        items: [
          {
            ...budgetPlan.items[0]!,
            limitMinor: 0,
            remainingMinor: 0,
            usedPercent: 0,
          },
        ],
      },
    });

    const budget = await reader.getBudgetStatus(context, "2026-07-01");

    expect(budget.data).toMatchObject({
      totalLimit: "PHP 0.00",
      totalSpent: "PHP 696.00",
      remaining: "PHP 0.00",
      usedPercent: 0,
      months: [
        {
          hasBudget: false,
          limit: "PHP 0.00",
          spent: "PHP 696.00",
          remaining: "PHP 0.00",
          usedPercent: 0,
          items: [{ limit: "PHP 0.00", spent: "PHP 696.00", remaining: "PHP 0.00" }],
        },
      ],
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
      "PHP",
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
      "PHP",
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
      "PHP",
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

// Aggregates count only the workspace currency, never convert, and say what they left out.
describe("assistant financial reader workspace currency", () => {
  const usdRow: AnalysisRow = {
    ...analysisRow,
    id: "transaction-usd",
    description: "Hosting",
    amountMinor: -5_000,
    currency: "USD",
    accountId: "account-usd",
    accountName: "Dollar card",
  };
  const usdIncome: AnalysisRow = {
    ...usdRow,
    id: "transaction-usd-income",
    description: "Freelance",
    amountMinor: 20_000,
    kind: "income",
  };
  const excludedSignal = {
    code: "other_currency_excluded",
    message: expect.stringContaining("left out"),
  };

  it("does not report an opening balance in the other currency as left out", async () => {
    const usdOpening: AnalysisRow = {
      ...usdIncome,
      id: "transaction-usd-opening",
      description: "Opening cash balance",
      categorySystemKey: OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
    };
    const { reader } = createReader({ analysisRows: [analysisRow, usdOpening] });

    const result = await reader.getPeriodSummary(context, dashboardSummary.period);

    expect(result.dataQuality.signals.map((signal) => signal.code)).not.toContain(
      "other_currency_excluded",
    );
  });

  it("summarizes a period in the workspace currency only", async () => {
    const { reader, dashboardLoader } = createReader({
      analysisRows: [analysisRow, usdRow, usdIncome],
    });

    const result = await reader.getPeriodSummary(context, dashboardSummary.period);

    expect(dashboardLoader).toHaveBeenCalledWith(
      env,
      "tenant-1",
      dashboardSummary.period,
      undefined,
      "PHP",
    );
    expect(result.data).toMatchObject({
      currency: "PHP",
      expenses: "PHP 696.00",
      monthlyAverages: { expenses: "PHP 696.00" },
    });
    expect(result.source.recordCount).toBe(1);
    // The summary totals income and expenses, so both USD rows were left out.
    expect(result.dataQuality.signals).toContainEqual({ ...excludedSignal, count: 2 });
  });

  it("totals spending by category without the other currency", async () => {
    const { reader } = createReader({ analysisRows: [analysisRow, usdRow, usdIncome] });

    const result = await reader.getSpendingByCategory(context, dashboardSummary.period);

    expect(result.data).toMatchObject({
      total: "PHP 696.00",
      items: [{ name: category.name, amount: "PHP 696.00", transactionCount: 1 }],
    });
    expect(result.dataQuality.status).toBe("limited");
    // Only the USD expense would have been summed; the USD income is not counted as left out.
    expect(result.dataQuality.signals).toContainEqual({ ...excludedSignal, count: 1 });
  });

  it("compares budgets with workspace-currency spending only", async () => {
    const { reader } = createReader({ analysisRows: [analysisRow, usdRow] });

    const result = await reader.getBudgetStatus(context, "2026-07-01");

    expect(result.data).toMatchObject({
      totalSpent: "PHP 696.00",
      remaining: "PHP 304.00",
      months: [{ spent: "PHP 696.00", items: [{ spent: "PHP 696.00" }] }],
    });
    expect(result.dataQuality.signals).toContainEqual({ ...excludedSignal, count: 1 });
  });

  it("formats aggregates with a USD workspace currency and leaves pesos out", async () => {
    const { reader } = createReader({
      analysisRows: [analysisRow, usdRow],
      workspaceCurrency: "USD",
    });

    const result = await reader.getSpendingByCategory(context, dashboardSummary.period);

    expect(result.data).toMatchObject({ total: "USD 50.00" });
    expect(result.dataQuality.signals).toContainEqual({
      code: "other_currency_excluded",
      message: expect.stringContaining("transactions in PHP were left out"),
      count: 1,
    });
  });

  it("detects recurring charges only among workspace-currency rows", async () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07"];
    const rows = months.flatMap((month, index) => [
      { ...analysisRow, id: `php-${index}`, date: `${month}-05`, description: "Internet" },
      { ...usdRow, id: `usd-${index}`, date: `${month}-10`, description: "Hosting" },
    ]);
    const { reader } = createReader({ analysisRows: rows });

    const result = await reader.detectRecurringCharges(context, "2026-07-31");

    expect(result.data).toMatchObject({
      items: [{ description: "Internet", typicalAmount: "PHP 696.00" }],
    });
    expect(JSON.stringify(result.data)).not.toContain("Hosting");
    expect(result.dataQuality.signals).toContainEqual({ ...excludedSignal, count: 4 });
  });

  it("flags anomalies against a workspace-currency baseline only", async () => {
    const baseline = Array.from({ length: 6 }, (_, index) => ({
      ...analysisRow,
      id: `baseline-${index}`,
      date: `2026-0${index + 1}-15`,
      amountMinor: -10_000,
    }));
    const usdSpike = { ...usdRow, date: "2026-07-20", amountMinor: -9_000_000 };
    const { reader } = createReader({ analysisRows: [...baseline, analysisRow, usdSpike] });

    const result = await reader.detectSpendingAnomalies(context, dashboardSummary.period);

    expect(JSON.stringify(result.data)).not.toContain("Hosting");
    expect(JSON.stringify(result.data)).not.toContain("USD");
    expect(result.dataQuality.signals).toContainEqual({ ...excludedSignal, count: 1 });
  });

  it("formats each account and listed transaction in its own currency", async () => {
    const dollarAccount: AccountRecord = {
      ...savingsAccount,
      id: "account-usd",
      name: "Dollar card",
      currency: "USD",
      balanceMinor: 5_000,
    };
    const { reader } = createReader({ accountItems: [savingsAccount, dollarAccount] });

    const result = await reader.getAccountBalances(context);

    expect(result.data).toMatchObject({
      currency: "PHP",
      overallBalance: "PHP 1,234.56",
      items: [
        { name: "Savings", balance: "PHP 1,234.56" },
        { name: "Dollar card", balance: "USD 50.00" },
      ],
    });
  });
});
