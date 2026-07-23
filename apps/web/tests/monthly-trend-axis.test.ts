import { describe, expect, it } from "vitest";

import { createMonthlyTrendAxis, formatMonthlyTrendTick } from "../src/lib/monthlyTrendAxis";

function expectValidAxis(maximumMinor: number) {
  const axis = createMonthlyTrendAxis(maximumMinor);
  const labels = axis.ticks.map((tick) => formatMonthlyTrendTick(tick, axis));

  expect(axis.ticks).toHaveLength(5);
  expect(new Set(axis.ticks).size).toBe(5);
  expect(new Set(labels).size).toBe(5);
  expect(axis.domain).toEqual([0, axis.stepMinor * 4]);
  expect(axis.domain[1]).toBeGreaterThanOrEqual(maximumMinor);
  expect(axis.ticks.slice(1).map((tick, index) => tick - axis.ticks[index]!)).toEqual([
    axis.stepMinor,
    axis.stepMinor,
    axis.stepMinor,
    axis.stepMinor,
  ]);

  return { axis, labels };
}

describe("monthly trend axis", () => {
  it("uses whole-peso labels for a maximum of ₱696", () => {
    const { axis, labels } = expectValidAxis(69_600);

    expect(axis.ticks).toEqual([0, 20_000, 40_000, 60_000, 80_000]);
    expect(labels).toEqual(["₱0", "₱200", "₱400", "₱600", "₱800"]);
  });

  it("preserves half-thousand precision for a maximum of ₱2,000", () => {
    const { axis, labels } = expectValidAxis(200_000);

    expect(axis.ticks).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
    expect(labels).toEqual(["₱0", "₱0.5k", "₱1k", "₱1.5k", "₱2k"]);
  });

  it("uses a larger nice step for a maximum of ₱15,000", () => {
    const { axis, labels } = expectValidAxis(1_500_000);

    expect(axis.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(labels).toEqual(["₱0", "₱5k", "₱10k", "₱15k", "₱20k"]);
  });

  it("keeps five unique ticks when all values are zero", () => {
    const { axis, labels } = expectValidAxis(0);

    expect(axis.ticks).toEqual([0, 100, 200, 300, 400]);
    expect(labels).toEqual(["₱0", "₱1", "₱2", "₱3", "₱4"]);
  });

  it("rounds the step upward when the maximum crosses a nice boundary", () => {
    const { axis } = expectValidAxis(200_001);

    expect(axis.stepMinor).toBe(100_000);
    expect(axis.domain).toEqual([0, 400_000]);
  });
});
