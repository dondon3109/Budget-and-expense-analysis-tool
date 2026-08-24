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
const weeklyData = {
  view: "weekly" as const,
  granularity: "day" as const,
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

function installNarrowViewport(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("MonthlyTrend on narrow viewports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("replaces the desktop chart with the touch-first SVG chart", () => {
    installNarrowViewport(true);
    const { container } = render(
      <MonthlyTrend data={weeklyData} selectedView="weekly" onViewChange={vi.fn()} />,
    );

    expect(container.querySelector(".trend-chart")).toBeNull();
    expect(container.querySelector(".trend-chart-mobile")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Money in and out chart" })).toBeInTheDocument();
    expect(screen.getByText("₱10,000")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
  });

  it("reveals the selected day values on tap and dismisses them on a second tap", () => {
    installNarrowViewport(true);
    const { container } = render(
      <MonthlyTrend data={weeklyData} selectedView="weekly" onViewChange={vi.fn()} />,
    );
    const chart = container.querySelector(".trend-chart-mobile svg")!;
    const tap = { pointerId: 7, clientX: 200 };

    fireEvent.pointerDown(chart, tap);
    fireEvent.pointerUp(chart, tap);

    const callout = container.querySelector(".trend-chart-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent("July 24, 2026");
    expect(callout).toHaveTextContent("Income");
    expect(callout).toHaveTextContent("Expenses");
    expect(callout).toHaveTextContent("₱250");

    fireEvent.pointerDown(chart, tap);
    fireEvent.pointerUp(chart, tap);
    expect(container.querySelector(".trend-chart-callout")).toBeNull();
  });

  it("keeps the desktop recharts chart on wide viewports", () => {
    installNarrowViewport(false);
    const { container } = render(
      <MonthlyTrend data={weeklyData} selectedView="weekly" onViewChange={vi.fn()} />,
    );

    expect(container.querySelector(".trend-chart-mobile")).toBeNull();
    expect(container.querySelector(".trend-chart")).toBeInTheDocument();
  });

  it("expands beyond ₱10,000 and keeps overlapping mobile lines distinguishable", () => {
    installNarrowViewport(true);
    const overlappingData = {
      ...weeklyData,
      points: weeklyData.points.map((point, index) => ({
        ...point,
        incomeMinor: index === 3 ? 1_500_000 : 0,
        expenseMinor: index === 3 ? 1_500_000 : 0,
      })),
    };
    const { container } = render(
      <MonthlyTrend data={overlappingData} selectedView="weekly" onViewChange={vi.fn()} />,
    );

    expect(screen.getByText("₱20,000")).toBeInTheDocument();
    const incomeLine = container.querySelector(".trend-mobile-line.income");
    const expenseLine = container.querySelector(".trend-mobile-line.expense");
    expect(incomeLine).toHaveAttribute("d", expenseLine?.getAttribute("d"));
    expect(expenseLine).toHaveAttribute("stroke-dasharray", "6 5");
    expect(container.querySelector(".trend-mobile-area")).toBeNull();
  });
});
