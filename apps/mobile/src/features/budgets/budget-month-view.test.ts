import { buildBudgetMonthView } from "./budget-month-view";

const categories = [
  {
    id: "category-1",
    name: "Dining",
    kind: "expense" as const,
    color: "#123456",
    iconEmoji: "🍔",
    pending: false,
  },
  {
    id: "category-2",
    name: "Groceries",
    kind: "expense" as const,
    color: "#0F766E",
    iconEmoji: "🛒",
    pending: false,
  },
];

describe("buildBudgetMonthView", () => {
  it("computes per-category and total budget progress", () => {
    const view = buildBudgetMonthView({
      categories,
      budgets: [
        {
          id: "budget-1",
          categoryId: "category-1",
          categoryName: "Dining",
          categoryColor: "#123456",
          limitMinor: 50_000,
          spentMinor: 25_000,
          syncState: "synced" as const,
        },
        {
          id: "budget-2",
          categoryId: "category-2",
          categoryName: "Groceries",
          categoryColor: "#0F766E",
          limitMinor: 20_000,
          spentMinor: 20_000,
          syncState: "synced" as const,
        },
      ],
    });

    expect(view.rows).toEqual([
      {
        id: "budget-1",
        categoryId: "category-1",
        categoryName: "Dining",
        categoryColor: "#123456",
        categoryIconEmoji: "🍔",
        limitMinor: 50_000,
        spentMinor: 25_000,
        remainingMinor: 25_000,
        usedPercent: 50,
        overBudget: false,
        syncState: "synced",
      },
      {
        id: "budget-2",
        categoryId: "category-2",
        categoryName: "Groceries",
        categoryColor: "#0F766E",
        categoryIconEmoji: "🛒",
        limitMinor: 20_000,
        spentMinor: 20_000,
        remainingMinor: 0,
        usedPercent: 100,
        overBudget: false,
        syncState: "synced",
      },
    ]);
    expect(view.totalLimitMinor).toBe(70_000);
    expect(view.totalSpentMinor).toBe(45_000);
    expect(view.totalRemainingMinor).toBe(25_000);
    expect(view.totalUsedPercent).toBe(64.3);
  });

  it("flags over-budget categories and excludes zero-limit rows", () => {
    const view = buildBudgetMonthView({
      categories,
      budgets: [
        {
          id: "budget-1",
          categoryId: "category-1",
          categoryName: "Dining",
          categoryColor: "#123456",
          limitMinor: 10_000,
          spentMinor: 15_000,
          syncState: "conflicted" as const,
        },
        {
          id: "budget-2",
          categoryId: "category-2",
          categoryName: "Groceries",
          categoryColor: "#0F766E",
          limitMinor: 0,
          spentMinor: 0,
          syncState: "synced" as const,
        },
      ],
    });

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      id: "budget-1",
      categoryId: "category-1",
      usedPercent: 150,
      remainingMinor: -5_000,
      overBudget: true,
      syncState: "conflicted",
    });
    expect(view.totalLimitMinor).toBe(10_000);
  });
});
