import type { CashflowTrend } from "@zoption/shared";

import {
  buildChartGeometry,
  chartSummaryLabel,
  compactDateLabel,
  createCashflowAxis,
  fullDateLabel,
  indexForPosition,
  areaPathD,
  linePathD,
  xAxisInterval,
} from "./cashflow-chart-geometry";

const weekly: CashflowTrend = {
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

describe("cashflow chart geometry", () => {
  it("builds a readable ₱10,000 axis for quiet periods", () => {
    const axis = createCashflowAxis(40_000);
    expect(axis.ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(axis.domainMax).toBe(1_000_000);
  });

  it("scales the axis to large amounts with five ticks", () => {
    const axis = createCashflowAxis(3_000_000);
    expect(axis.domainMax).toBeGreaterThanOrEqual(3_000_000);
    expect(axis.ticks).toHaveLength(5);
    expect(axis.ticks[0]).toBe(0);
    expect(axis.ticks[4]).toBe(axis.domainMax);
  });

  it("labels day points as day numbers and month points as month names", () => {
    expect(compactDateLabel("2026-07-21", "day")).toBe("21");
    expect(compactDateLabel("2026-07-01", "month")).toBe("Jul");
    expect(fullDateLabel("2026-07-21", "day")).toBe("July 21, 2026");
    expect(fullDateLabel("2026-07-01", "month")).toBe("July 2026");
  });

  it("shows every label for short ranges and thins long daily ranges", () => {
    expect(xAxisInterval(7, "day")).toBe(0);
    expect(xAxisInterval(6, "month")).toBe(0);
    expect(xAxisInterval(31, "day")).toBe(4);
  });

  it("maps a press position to the nearest point and rejects the gutter", () => {
    expect(indexForPosition(48, 320, 7)).toBe(0);
    expect(indexForPosition(272, 320, 7)).toBe(5);
    expect(indexForPosition(304, 320, 7)).toBe(6);
    expect(indexForPosition(48, 320, 1)).toBe(0);
    expect(indexForPosition(20, 320, 7)).toBeNull();
    expect(indexForPosition(0, 320, 7)).toBeNull();
    expect(indexForPosition(100, 0, 7)).toBeNull();
  });

  it("builds line paths with zero at the baseline", () => {
    const geometry = buildChartGeometry(320, 7, 1_000_000);
    const d = linePathD(weekly.points, (point) => point.incomeMinor, geometry);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(geometry.yAt(0)).toBe(geometry.baselineY);
    expect(geometry.yAt(1_000_000)).toBe(12);
    const area = areaPathD(d, geometry, weekly.points.length);
    expect(area.endsWith("Z")).toBe(true);
    expect(area).toContain(`L${geometry.xAt(6).toFixed(1)},${geometry.baselineY.toFixed(1)}`);
    expect(area).toContain(`L${geometry.xAt(0).toFixed(1)},${geometry.baselineY.toFixed(1)}Z`);
  });

  it("summarizes every point for screen readers", () => {
    const label = chartSummaryLabel(weekly);
    expect(label).toContain("Money in and out chart");
    expect(label).toContain("July 21, 2026: income ₱0, expense ₱120");
    expect(label).toContain("July 27, 2026: income ₱100, expense ₱40");
  });
});
