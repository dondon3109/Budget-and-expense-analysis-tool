// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { MonthlyTrend } from "../src/components/dashboard/MonthlyTrend";

const data = {
  view: "sixMonth" as const,
  granularity: "month" as const,
  range: { from: "2026-02-01", to: "2026-07-31" },
  points: [
    { date: "2026-06-01", incomeMinor: 10_000, expenseMinor: 4_000 },
    { date: "2026-07-01", incomeMinor: 12_000, expenseMinor: 5_000 },
  ],
};

describe("MonthlyTrend", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses an accessible direct selector for cashflow views", () => {
    const onViewChange = vi.fn();
    render(<MonthlyTrend data={data} selectedView="sixMonth" onViewChange={onViewChange} />);

    const group = screen.getByRole("radiogroup", { name: "Cashflow time range" });
    const weekly = screen.getByRole("radio", { name: "Weekly" });
    const monthly = screen.getByRole("radio", { name: "Monthly" });
    const sixMonth = screen.getByRole("radio", { name: "Six-month" });

    expect(sixMonth).toHaveAttribute("aria-checked", "true");
    expect(weekly).toHaveAttribute("aria-checked", "false");
    expect(monthly).toHaveAttribute("tabindex", "-1");
    expect(group).toBeInTheDocument();

    fireEvent.keyDown(sixMonth, { key: "ArrowLeft" });
    expect(onViewChange).toHaveBeenCalledWith("monthly");
    expect(monthly).toHaveFocus();

    fireEvent.click(weekly);
    expect(onViewChange).toHaveBeenLastCalledWith("weekly");
  });

  it("changes the accessible table description for the selected view", () => {
    render(<MonthlyTrend data={data} selectedView="sixMonth" onViewChange={vi.fn()} />);

    expect(screen.getByText("Six-month money in and expenses")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Income (₱)" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "June 2026" })).toBeInTheDocument();
  });

  it("explains an empty weekly range and offers eligible Free users subscription options", () => {
    const onSubscribeToPro = vi.fn();
    render(
      <MonthlyTrend
        data={{
          view: "weekly",
          granularity: "day",
          range: { from: "2026-07-21", to: "2026-07-27" },
          points: [{ date: "2026-07-21", incomeMinor: 0, expenseMinor: 0 }],
        }}
        selectedView="weekly"
        onViewChange={vi.fn()}
        showSubscribeToPro
        onSubscribeToPro={onSubscribeToPro}
      />,
    );

    expect(screen.getByText("No money in or out for this week")).toBeInTheDocument();
    expect(
      screen.getByText(/no transactions fall within jul 21, 2026.*jul 27, 2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/outside these displayed dates are not included/i)).toBeInTheDocument();

    const subscribe = screen.getByRole("button", { name: "Subscribe to Pro" });
    fireEvent.click(subscribe);
    expect(onSubscribeToPro).toHaveBeenCalledWith(subscribe);
  });

  it("does not show subscription options without a confirmed Free plan", () => {
    render(
      <MonthlyTrend
        data={{
          view: "weekly",
          granularity: "day",
          range: { from: "2026-07-21", to: "2026-07-27" },
          points: [{ date: "2026-07-21", incomeMinor: 0, expenseMinor: 0 }],
        }}
        selectedView="weekly"
        onViewChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Subscribe to Pro" })).not.toBeInTheDocument();
  });
});
