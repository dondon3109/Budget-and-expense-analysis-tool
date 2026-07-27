import { describe, expect, it } from "vitest";

import { createMonthlyTrendAxis, formatMonthlyTrendTick } from "../src/lib/monthlyTrendAxis";

function expectValidAxis(maximumMinor: number) {
  const axis = createMonthlyTrendAxis(maximumMinor);
  const labels = axis.ticks.map((tick) => formatMonthlyTrendTick(tick));

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
  it("keeps a ₱10,000 range for small values", () => {
    const { axis, labels } = expectValidAxis(69_600);

    expect(axis.ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(labels).toEqual(["₱0", "₱2,500", "₱5,000", "₱7,500", "₱10,000"]);
  });

  it("keeps a ₱10,000 range for values below the default high point", () => {
    const { axis, labels } = expectValidAxis(200_000);

    expect(axis.ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(labels).toEqual(["₱0", "₱2,500", "₱5,000", "₱7,500", "₱10,000"]);
  });

  it("uses a larger nice step for a maximum of ₱15,000", () => {
    const { axis, labels } = expectValidAxis(1_500_000);

    expect(axis.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(labels).toEqual(["₱0", "₱5,000", "₱10,000", "₱15,000", "₱20,000"]);
  });

  it("keeps the ₱10,000 range when all values are zero", () => {
    const { axis, labels } = expectValidAxis(0);

    expect(axis.ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(labels).toEqual(["₱0", "₱2,500", "₱5,000", "₱7,500", "₱10,000"]);
  });

  it("rounds the step upward when the maximum exceeds the default high point", () => {
    const { axis } = expectValidAxis(1_000_001);

    expect(axis.stepMinor).toBe(500_000);
    expect(axis.domain).toEqual([0, 2_000_000]);
  });
});
