import { render, screen } from "@testing-library/react-native";
import type { CashflowTrend } from "@zoption/shared";

import { CashflowChart } from "./CashflowChart";

const cashflow: CashflowTrend = {
  view: "weekly",
  granularity: "day",
  range: { from: "2026-07-21", to: "2026-07-27" },
  points: [
    { date: "2026-07-21", incomeMinor: 0, expenseMinor: 12_000 },
    { date: "2026-07-22", incomeMinor: 40_000, expenseMinor: 3_000 },
    { date: "2026-07-23", incomeMinor: 0, expenseMinor: 9_000 },
    { date: "2026-07-24", incomeMinor: 25_000, expenseMinor: 15_000 },
    { date: "2026-07-25", incomeMinor: 0, expenseMinor: 6_000 },
    { date: "2026-07-26", incomeMinor: 0, expenseMinor: 8_000 },
    { date: "2026-07-27", incomeMinor: 10_000, expenseMinor: 4_000 },
  ],
};

describe("CashflowChart", () => {
  it("renders an income versus expenses line chart, not progress bars", async () => {
    await render(<CashflowChart cashflow={cashflow} />);
    expect(screen.getByLabelText(/Money in and out chart/)).toBeTruthy();
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.getByText("Expenses")).toBeTruthy();
    expect(screen.queryByLabelText(/percent of spending/)).toBeNull();
  });
});
