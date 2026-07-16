import { buildDashboardSummary } from "./calculations";
import type { BudgetRecord, TransactionRecord } from "./types";

const category = {
  salary: { id: "salary", name: "Salary", color: "#3f8f74" },
  housing: { id: "housing", name: "Housing", color: "#6f6bd9" },
  food: { id: "food", name: "Food & dining", color: "#dc8b3f" },
  transport: { id: "transport", name: "Transport", color: "#3a83c5" },
  utilities: { id: "utilities", name: "Utilities", color: "#b45a7a" },
  leisure: { id: "leisure", name: "Leisure", color: "#9a6ac2" },
} as const;

function transaction(
  id: string,
  date: string,
  description: string,
  amountMinor: number,
  kind: "income" | "expense",
  categoryKey: keyof typeof category,
): TransactionRecord {
  const selected = category[categoryKey];
  return {
    id,
    date,
    description,
    amountMinor,
    currency: "PHP",
    kind,
    categoryId: selected.id,
    categoryName: selected.name,
    categoryColor: selected.color,
    accountName: "Everyday account",
  };
}

export const demoTransactions: TransactionRecord[] = [
  transaction("t-01", "2026-02-15", "Monthly salary", 7200000, "income", "salary"),
  transaction("t-02", "2026-02-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-03", "2026-03-15", "Monthly salary", 7200000, "income", "salary"),
  transaction("t-04", "2026-03-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-05", "2026-04-15", "Monthly salary", 7350000, "income", "salary"),
  transaction("t-06", "2026-04-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-07", "2026-05-15", "Monthly salary", 7350000, "income", "salary"),
  transaction("t-08", "2026-05-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-09", "2026-06-15", "Monthly salary", 7350000, "income", "salary"),
  transaction("t-10", "2026-06-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-11", "2026-07-03", "Apartment rent", -1800000, "expense", "housing"),
  transaction("t-12", "2026-07-05", "Electric and water", -426500, "expense", "utilities"),
  transaction("t-13", "2026-07-07", "Weekly groceries", -348900, "expense", "food"),
  transaction("t-14", "2026-07-09", "Rail and ride share", -214000, "expense", "transport"),
  transaction("t-15", "2026-07-11", "Dinner with friends", -186500, "expense", "food"),
  transaction("t-16", "2026-07-13", "Streaming and cinema", -129900, "expense", "leisure"),
  transaction("t-17", "2026-07-15", "Monthly salary", 7350000, "income", "salary"),
  transaction("t-18", "2026-07-16", "Mobile and internet", -189900, "expense", "utilities"),
];

export const demoBudgets: BudgetRecord[] = [
  {
    categoryId: "housing",
    categoryName: "Housing",
    categoryColor: "#6f6bd9",
    month: "2026-07-01",
    limitMinor: 1800000,
  },
  {
    categoryId: "food",
    categoryName: "Food & dining",
    categoryColor: "#dc8b3f",
    month: "2026-07-01",
    limitMinor: 850000,
  },
  {
    categoryId: "transport",
    categoryName: "Transport",
    categoryColor: "#3a83c5",
    month: "2026-07-01",
    limitMinor: 450000,
  },
  {
    categoryId: "utilities",
    categoryName: "Utilities",
    categoryColor: "#b45a7a",
    month: "2026-07-01",
    limitMinor: 700000,
  },
  {
    categoryId: "leisure",
    categoryName: "Leisure",
    categoryColor: "#9a6ac2",
    month: "2026-07-01",
    limitMinor: 350000,
  },
];

export const demoDashboard = buildDashboardSummary(demoTransactions, demoBudgets, {
  from: "2026-07-01",
  to: "2026-07-31",
});
