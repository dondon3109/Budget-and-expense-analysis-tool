import { describe, expect, it } from "vitest";

import {
  calculateSafeToSpend,
  getDaysLeftInWeek,
  safeToSpend,
  type SafeToSpendOptions,
} from "../src/safeToSpend";

describe("safeToSpend", () => {
  it("handles zero envelope by returning zero", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 0,
      daysLeftInWeek: 4,
      forecast: { minProjectedBalanceMinor: 50_000 },
    };
    expect(safeToSpend(options)).toBe(0);
    expect(calculateSafeToSpend(options).safeToSpendMinor).toBe(0);
  });

  it("handles negative envelope by returning zero", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: -15_000,
      daysLeftInWeek: 5,
      forecast: { minProjectedBalanceMinor: 25_000 },
    };
    expect(safeToSpend(options)).toBe(0);
    expect(calculateSafeToSpend(options).safeToSpendMinor).toBe(0);
  });

  it("handles zero days left in the week by returning zero", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 10_000,
      daysLeftInWeek: 0,
      forecast: { minProjectedBalanceMinor: 50_000 },
    };
    expect(safeToSpend(options)).toBe(0);
    expect(calculateSafeToSpend(options).safeToSpendMinor).toBe(0);
  });

  it("handles negative days left in the week by returning zero", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 10_000,
      daysLeftInWeek: -2,
      forecast: { minProjectedBalanceMinor: 50_000 },
    };
    expect(safeToSpend(options)).toBe(0);
  });

  it("caps to zero when forecast minimum is below zero (never returns negative)", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 14_000,
      daysLeftInWeek: 4,
      forecast: { minProjectedBalanceMinor: -5_000 },
    };
    expect(safeToSpend(options)).toBe(0);
    const result = calculateSafeToSpend(options);
    expect(result.safeToSpendMinor).toBe(0);
    expect(result.rawDailyEnvelopeMinor).toBe(3500);
    expect(result.isForecastCapped).toBe(true);
  });

  it("caps to zero when forecast minimum is below the safety buffer", () => {
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 14_000,
      daysLeftInWeek: 4,
      forecast: { minProjectedBalanceMinor: 2_000 },
      safetyBufferMinor: 5_000,
    };
    expect(safeToSpend(options)).toBe(0);
  });

  it("handles normal mid-week case without forecast constraint", () => {
    // 7,000 minor units with 4 days left => 1,750 per day
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 7_000,
      daysLeftInWeek: 4,
      forecast: { minProjectedBalanceMinor: 50_000 },
    };
    expect(safeToSpend(options)).toBe(1_750);
    const result = calculateSafeToSpend(options);
    expect(result.safeToSpendMinor).toBe(1_750);
    expect(result.rawDailyEnvelopeMinor).toBe(1_750);
    expect(result.isForecastCapped).toBe(false);
  });

  it("caps to forecast safe limit when forecast is tighter than envelope pace", () => {
    // 14,000 minor units / 4 days = 3,500 minor pace, but forecast lowest point allows only 1,200
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 14_000,
      daysLeftInWeek: 4,
      forecast: { minProjectedBalanceMinor: 1_200 },
      safetyBufferMinor: 0,
    };
    expect(safeToSpend(options)).toBe(1_200);
    const result = calculateSafeToSpend(options);
    expect(result.safeToSpendMinor).toBe(1_200);
    expect(result.rawDailyEnvelopeMinor).toBe(3_500);
    expect(result.isForecastCapped).toBe(true);
  });

  it("works without forecast input and maintains integer minor units", () => {
    // 10,000 minor units / 3 days => 3,333 minor units (floored integer)
    const options: SafeToSpendOptions = {
      remainingWeeklyEnvelopeMinor: 10_000,
      daysLeftInWeek: 3,
    };
    expect(safeToSpend(options)).toBe(3_333);
    expect(Number.isInteger(safeToSpend(options))).toBe(true);
  });

  it("calculates days left in week correctly", () => {
    // Wednesday (day 3): Monday-start week has Wed, Thu, Fri, Sat, Sun = 5 days left
    const wednesday = new Date("2026-09-09T10:00:00Z");
    expect(getDaysLeftInWeek(wednesday, "monday")).toBe(5);

    // Sunday (day 0): Monday-start week has Sun = 1 day left
    const sunday = new Date("2026-09-13T10:00:00Z");
    expect(getDaysLeftInWeek(sunday, "monday")).toBe(1);

    // Monday (day 1): Monday-start week has 7 days left
    const monday = new Date("2026-09-07T10:00:00Z");
    expect(getDaysLeftInWeek(monday, "monday")).toBe(7);
  });
});
