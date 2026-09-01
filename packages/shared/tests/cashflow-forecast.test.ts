import { describe, expect, it } from "vitest";

import type { CashflowForecastOptions } from "../src/cashflowForecast";
import { projectCashflow } from "../src/cashflowForecast";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a date string offset from a base date by N days. */
function offsetDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Horizon projections ─────────────────────────────────────────────────────

describe("horizon projections", () => {
  const baseOptions: CashflowForecastOptions = {
    startingBalanceMinor: 500_000,
    subscriptions: [],
    startDate: "2026-03-01",
  };

  it("defaults to a 30-day horizon", () => {
    const result = projectCashflow(baseOptions);

    expect(result.horizonDays).toBe(30);
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-03-30");
    expect(result.dailyTimeline).toHaveLength(30);
    expect(result.dailyTimeline[0]!.date).toBe("2026-03-01");
    expect(result.dailyTimeline[0]!.dayIndex).toBe(0);
    expect(result.dailyTimeline[29]!.date).toBe("2026-03-30");
    expect(result.dailyTimeline[29]!.dayIndex).toBe(29);
  });

  it("produces a 60-day timeline", () => {
    const result = projectCashflow({ ...baseOptions, horizonDays: 60 });

    expect(result.horizonDays).toBe(60);
    expect(result.dailyTimeline).toHaveLength(60);
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-04-29");
    expect(result.dailyTimeline[59]!.date).toBe("2026-04-29");
  });

  it("produces a 90-day timeline", () => {
    const result = projectCashflow({ ...baseOptions, horizonDays: 90 });

    expect(result.horizonDays).toBe(90);
    expect(result.dailyTimeline).toHaveLength(90);
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-05-29");
    expect(result.dailyTimeline[89]!.date).toBe("2026-05-29");
  });

  it("reports correct summary metrics with no events", () => {
    const result = projectCashflow(baseOptions);

    expect(result.startingBalanceMinor).toBe(500_000);
    expect(result.endingBalanceMinor).toBe(500_000);
    expect(result.totalBillsMinor).toBe(0);
    expect(result.totalIncomeMinor).toBe(0);
    expect(result.netChangeMinor).toBe(0);
    expect(result.minProjectedBalanceMinor).toBe(500_000);
    expect(result.upcomingBillRisks).toEqual([]);
  });
});

// ── Monthly bill day clamping ───────────────────────────────────────────────

describe("recurring monthly bills with day clamping", () => {
  it("clamps Jan 31 -> Feb 28 in a non-leap year", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "rent",
          name: "Rent",
          amountMinor: 50_000,
          billingCycle: "monthly",
          nextBillingDate: "2025-01-31",
        },
      ],
      startDate: "2025-01-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "bill" && e.name === "Rent"))
      .map((d) => d.date);

    expect(billDates).toContain("2025-01-31");
    expect(billDates).toContain("2025-02-28"); // clamped from 31 to 28
    expect(billDates).toContain("2025-03-28"); // addMonths from Feb 28 stays 28
  });

  it("clamps Jan 31 -> Feb 29 in a leap year", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "rent",
          name: "Rent",
          amountMinor: 50_000,
          billingCycle: "monthly",
          nextBillingDate: "2024-01-31",
        },
      ],
      startDate: "2024-01-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "bill" && e.name === "Rent"))
      .map((d) => d.date);

    expect(billDates).toContain("2024-01-31");
    expect(billDates).toContain("2024-02-29"); // leap year Feb has 29 days
    expect(billDates).toContain("2024-03-29"); // clamped from Feb 29 -> Mar 29
  });

  it("clamps Mar 31 -> Apr 30 for 30-day months", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "sub",
          name: "Service",
          amountMinor: 10_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-31",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "bill" && e.name === "Service"))
      .map((d) => d.date);

    expect(billDates).toContain("2026-03-31");
    expect(billDates).toContain("2026-04-30"); // April has 30 days
  });

  it("generates multiple monthly occurrences over a 90-day horizon", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "netflix",
          name: "Netflix",
          amountMinor: 1_500,
          billingCycle: "monthly",
          nextBillingDate: "2026-01-15",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.name === "Netflix"))
      .map((d) => d.date);

    expect(billDates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(result.totalBillsMinor).toBe(1_500 * 3);
  });
});

// ── Yearly bills ────────────────────────────────────────────────────────────

describe("recurring yearly bills", () => {
  it("appears only on the anniversary within the horizon", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "annual",
          name: "Annual License",
          amountMinor: 120_000,
          billingCycle: "yearly",
          nextBillingDate: "2026-02-10",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.name === "Annual License"))
      .map((d) => d.date);

    expect(billDates).toEqual(["2026-02-10"]);
    expect(result.totalBillsMinor).toBe(120_000);
  });

  it("does not appear when the anniversary is outside the horizon", () => {
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "annual",
          name: "Annual License",
          amountMinor: 120_000,
          billingCycle: "yearly",
          nextBillingDate: "2026-06-01",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const billDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.name === "Annual License"))
      .map((d) => d.date);

    expect(billDates).toEqual([]);
    expect(result.totalBillsMinor).toBe(0);
  });

  it("generates two yearly occurrences only over a very long look-back when nextBillingDate is in range", () => {
    // Yearly billing: only one occurrence per 12 months, so over 90 days only 1 at most.
    const result = projectCashflow({
      startingBalanceMinor: 1_000_000,
      subscriptions: [
        {
          id: "annual",
          name: "Domain",
          amountMinor: 15_000,
          billingCycle: "yearly",
          nextBillingDate: "2026-01-05",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const events = result.dailyTimeline.flatMap((d) =>
      d.events.filter((e) => e.name === "Domain"),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.date).toBe("2026-01-05");
  });
});

// ── Recurring income cadences ───────────────────────────────────────────────

describe("recurring income with different cadences", () => {
  it("generates weekly income events every 7 days", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [],
      recurringIncomes: [
        {
          id: "freelance",
          name: "Freelance",
          amountMinor: 25_000,
          cadence: "weekly",
          nextDepositDate: "2026-03-01",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const incomeDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "income"))
      .map((d) => d.date);

    // Every 7 days from Mar 1: Mar 1, 8, 15, 22, 29
    expect(incomeDates).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
      "2026-03-22",
      "2026-03-29",
    ]);
    expect(result.totalIncomeMinor).toBe(25_000 * 5);
  });

  it("generates biweekly income events every 14 days", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [],
      recurringIncomes: [
        {
          id: "salary",
          name: "Salary",
          amountMinor: 100_000,
          cadence: "biweekly",
          nextDepositDate: "2026-03-01",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const incomeDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "income"))
      .map((d) => d.date);

    // Every 14 days from Mar 1: Mar 1, 15, 29
    expect(incomeDates).toEqual(["2026-03-01", "2026-03-15", "2026-03-29"]);
    expect(result.totalIncomeMinor).toBe(100_000 * 3);
  });

  it("generates monthly income events", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [],
      recurringIncomes: [
        {
          id: "salary",
          name: "Monthly Salary",
          amountMinor: 200_000,
          cadence: "monthly",
          nextDepositDate: "2026-01-15",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const incomeDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "income"))
      .map((d) => d.date);

    expect(incomeDates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(result.totalIncomeMinor).toBe(200_000 * 3);
  });

  it("generates yearly income events only on the anniversary", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [],
      recurringIncomes: [
        {
          id: "bonus",
          name: "Annual Bonus",
          amountMinor: 500_000,
          cadence: "yearly",
          nextDepositDate: "2026-02-01",
        },
      ],
      startDate: "2026-01-01",
      horizonDays: 90,
    });

    const incomeDates = result.dailyTimeline
      .filter((d) => d.events.some((e) => e.type === "income"))
      .map((d) => d.date);

    expect(incomeDates).toEqual(["2026-02-01"]);
    expect(result.totalIncomeMinor).toBe(500_000);
  });
});

// ── Deficit and safety buffer dip detection ─────────────────────────────────

describe("deficit and safety buffer dip detection", () => {
  it("detects critical deficit when balance drops below zero", () => {
    const result = projectCashflow({
      startingBalanceMinor: 10_000,
      subscriptions: [
        {
          id: "big-bill",
          name: "Big Bill",
          amountMinor: 20_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-05",
        },
      ],
      safetyBufferMinor: 5_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.hasDeficit).toBe(true);
    expect(result.hasBufferDip).toBe(true);

    // Day of the bill (Mar 5)
    const deficitDay = result.dailyTimeline.find((d) => d.date === "2026-03-05")!;
    expect(deficitDay.isDeficit).toBe(true);
    expect(deficitDay.isDip).toBe(true);
    expect(deficitDay.projectedBalanceMinor).toBe(-10_000);

    // Bill risk for the big bill
    const risk = result.upcomingBillRisks.find((r) => r.billName === "Big Bill")!;
    expect(risk.riskLevel).toBe("critical_deficit");
    expect(risk.projectedBalanceAfterMinor).toBe(-10_000);
    expect(risk.deficitMinor).toBe(10_000 + 5_000); // |balance| + safetyBuffer
  });

  it("detects low buffer dip when balance drops below safetyBuffer but >= 0", () => {
    const result = projectCashflow({
      startingBalanceMinor: 50_000,
      subscriptions: [
        {
          id: "bill",
          name: "Moderate Bill",
          amountMinor: 45_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
        },
      ],
      safetyBufferMinor: 20_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.hasDeficit).toBe(false);
    expect(result.hasBufferDip).toBe(true);

    // After the bill: 50_000 - 45_000 = 5_000 which is < 20_000 buffer
    const dipDay = result.dailyTimeline.find((d) => d.date === "2026-03-10")!;
    expect(dipDay.isDip).toBe(true);
    expect(dipDay.isDeficit).toBe(false);
    expect(dipDay.projectedBalanceMinor).toBe(5_000);

    const risk = result.upcomingBillRisks.find((r) => r.billName === "Moderate Bill")!;
    expect(risk.riskLevel).toBe("low_buffer");
    expect(risk.deficitMinor).toBe(20_000 - 5_000); // safetyBuffer - balanceAfter
  });

  it("reports safe when balance stays above the safety buffer", () => {
    const result = projectCashflow({
      startingBalanceMinor: 500_000,
      subscriptions: [
        {
          id: "small",
          name: "Small Bill",
          amountMinor: 5_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-15",
        },
      ],
      safetyBufferMinor: 50_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.hasDeficit).toBe(false);
    expect(result.hasBufferDip).toBe(false);
    expect(result.dipDaysCount).toBe(0);

    // Every day should be safe
    for (const day of result.dailyTimeline) {
      expect(day.isDip).toBe(false);
      expect(day.isDeficit).toBe(false);
    }

    const risk = result.upcomingBillRisks.find((r) => r.billName === "Small Bill")!;
    expect(risk.riskLevel).toBe("safe");
    expect(risk.deficitMinor).toBe(0);
  });

  it("counts dip days correctly across the timeline", () => {
    // Balance = 30_000. Bill of 25_000 on day 5 brings balance to 5_000.
    // Safety buffer = 10_000. Days 5-29 are all dip days (25 days).
    const result = projectCashflow({
      startingBalanceMinor: 30_000,
      subscriptions: [
        {
          id: "bill",
          name: "Bill",
          amountMinor: 25_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-06",
        },
      ],
      safetyBufferMinor: 10_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    // Days 0-4 (Mar 1-5): balance 30_000 (safe). Day 5 (Mar 6): balance 5_000 (dip).
    // Days 5-29 all dip = 25 dip days.
    expect(result.dipDaysCount).toBe(25);
    expect(result.hasBufferDip).toBe(true);
    expect(result.hasDeficit).toBe(false);
  });

  it("tracks minProjectedBalanceMinor and minBalanceDate correctly", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "bill1",
          name: "Bill A",
          amountMinor: 60_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-05",
        },
        {
          id: "bill2",
          name: "Bill B",
          amountMinor: 30_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
        },
      ],
      recurringIncomes: [
        {
          id: "salary",
          name: "Salary",
          amountMinor: 200_000,
          cadence: "monthly",
          nextDepositDate: "2026-03-15",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    // Balance timeline:
    // Start: 100_000
    // Mar 5: 100_000 - 60_000 = 40_000
    // Mar 10: 40_000 - 30_000 = 10_000 (minimum)
    // Mar 15: 10_000 + 200_000 = 210_000
    expect(result.minProjectedBalanceMinor).toBe(10_000);
    expect(result.minBalanceDate).toBe("2026-03-10");
  });
});

// ── Inactive/canceled subscriptions ─────────────────────────────────────────

describe("inactive and canceled subscriptions", () => {
  it("ignores canceled subscriptions", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "active",
          name: "Active Sub",
          amountMinor: 10_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "active",
        },
        {
          id: "canceled",
          name: "Canceled Sub",
          amountMinor: 50_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "canceled",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.totalBillsMinor).toBe(10_000);
    const allBillNames = result.dailyTimeline.flatMap((d) =>
      d.events.filter((e) => e.type === "bill").map((e) => e.name),
    );
    expect(allBillNames).not.toContain("Canceled Sub");
    expect(allBillNames).toContain("Active Sub");
  });

  it("ignores paused subscriptions", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "paused",
          name: "Paused Sub",
          amountMinor: 30_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "paused",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.totalBillsMinor).toBe(0);
    expect(result.upcomingBillRisks).toEqual([]);
  });

  it("handles case-insensitive status checks (Canceled, PAUSED)", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "c1",
          name: "Sub A",
          amountMinor: 10_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "Canceled",
        },
        {
          id: "p1",
          name: "Sub B",
          amountMinor: 10_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "PAUSED",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.totalBillsMinor).toBe(0);
  });

  it("includes subscriptions with undefined or other status values", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "no-status",
          name: "No Status",
          amountMinor: 5_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
        },
        {
          id: "active",
          name: "Active",
          amountMinor: 5_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "active",
        },
        {
          id: "trial",
          name: "Trial",
          amountMinor: 5_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "trialing",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.totalBillsMinor).toBe(15_000);
  });
});

// ── Income applied before bills on the same day ─────────────────────────────

describe("income applied before bills on the same day", () => {
  it("applies income before bills, preventing a false deficit", () => {
    // Balance: 0. Income of 50_000 and bill of 30_000 both on Mar 5.
    // If income applies first: 0 + 50_000 - 30_000 = 20_000 (no deficit).
    // If bill applies first: 0 - 30_000 = -30_000 (deficit).
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [
        {
          id: "bill",
          name: "Rent",
          amountMinor: 30_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-05",
        },
      ],
      recurringIncomes: [
        {
          id: "salary",
          name: "Salary",
          amountMinor: 50_000,
          cadence: "monthly",
          nextDepositDate: "2026-03-05",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const payday = result.dailyTimeline.find((d) => d.date === "2026-03-05")!;
    expect(payday.projectedBalanceMinor).toBe(20_000);
    expect(payday.isDeficit).toBe(false);
    expect(result.hasDeficit).toBe(false);

    // Verify event ordering: income comes first in the events array
    expect(payday.events[0]!.type).toBe("income");
    expect(payday.events[1]!.type).toBe("bill");
  });

  it("bill risk reflects balance after income is deposited first", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [
        {
          id: "bill",
          name: "Utility",
          amountMinor: 10_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-05",
        },
      ],
      recurringIncomes: [
        {
          id: "income",
          name: "Pay",
          amountMinor: 50_000,
          cadence: "monthly",
          nextDepositDate: "2026-03-05",
        },
      ],
      safetyBufferMinor: 10_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const risk = result.upcomingBillRisks.find((r) => r.billName === "Utility")!;
    // Income (50_000) applied first, then bill (10_000) => balance after = 40_000
    expect(risk.projectedBalanceAfterMinor).toBe(40_000);
    expect(risk.riskLevel).toBe("safe");
  });
});

// ── End-to-end integration ──────────────────────────────────────────────────

describe("end-to-end integration", () => {
  it("projects a realistic scenario with mixed bills and income", () => {
    const result = projectCashflow({
      startingBalanceMinor: 150_000,
      subscriptions: [
        {
          id: "rent",
          name: "Rent",
          amountMinor: 80_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-01",
          categoryName: "Housing",
        },
        {
          id: "spotify",
          name: "Spotify",
          amountMinor: 500,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-05",
          categoryName: "Entertainment",
        },
        {
          id: "gym-canceled",
          name: "Gym",
          amountMinor: 3_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
          status: "canceled",
        },
      ],
      recurringIncomes: [
        {
          id: "salary",
          name: "Salary",
          amountMinor: 200_000,
          cadence: "monthly",
          nextDepositDate: "2026-03-15",
        },
      ],
      safetyBufferMinor: 50_000,
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    // Day 1 (Mar 1): 150_000 - 80_000 = 70_000
    // Day 5 (Mar 5): 70_000 - 500 = 69_500
    // Day 15 (Mar 15): 69_500 + 200_000 = 269_500
    // Gym is canceled: not counted
    expect(result.totalBillsMinor).toBe(80_000 + 500);
    expect(result.totalIncomeMinor).toBe(200_000);
    expect(result.endingBalanceMinor).toBe(150_000 - 80_000 - 500 + 200_000);
    expect(result.netChangeMinor).toBe(200_000 - 80_500);

    // Safety buffer dip: balance between Mar 1 and Mar 14 is below 50_000
    // After rent: 70_000 > 50_000 (safe)
    // After spotify: 69_500 > 50_000 (safe)
    expect(result.hasDeficit).toBe(false);

    // The rent bill should have a category
    const rentRisk = result.upcomingBillRisks.find((r) => r.billName === "Rent")!;
    expect(rentRisk.dueDate).toBe("2026-03-01");
    expect(rentRisk.daysUntilDue).toBe(0); // dayIndex 0
  });

  it("correctly computes endingBalanceMinor across the full timeline", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          id: "bill",
          name: "Bill",
          amountMinor: 20_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
        },
      ],
      recurringIncomes: [
        {
          id: "weekly",
          name: "Gig",
          amountMinor: 10_000,
          cadence: "weekly",
          nextDepositDate: "2026-03-01",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    // Weekly income: Mar 1, 8, 15, 22, 29 = 5 × 10_000 = 50_000
    // Monthly bill: Mar 10 = 20_000
    // Ending: 100_000 + 50_000 - 20_000 = 130_000
    expect(result.totalIncomeMinor).toBe(50_000);
    expect(result.totalBillsMinor).toBe(20_000);
    expect(result.endingBalanceMinor).toBe(130_000);
    expect(result.dailyTimeline[result.dailyTimeline.length - 1]!.projectedBalanceMinor).toBe(
      130_000,
    );
  });

  it("uses subscription name as id fallback when id is undefined", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [
        {
          name: "No-ID Sub",
          amountMinor: 5_000,
          billingCycle: "monthly",
          nextBillingDate: "2026-03-10",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const event = result.dailyTimeline
      .flatMap((d) => d.events)
      .find((e) => e.name === "No-ID Sub")!;
    expect(event.id).toBe("No-ID Sub");

    const risk = result.upcomingBillRisks.find((r) => r.billName === "No-ID Sub")!;
    expect(risk.billId).toBe("No-ID Sub");
  });

  it("uses income name as id fallback when id is undefined", () => {
    const result = projectCashflow({
      startingBalanceMinor: 0,
      subscriptions: [],
      recurringIncomes: [
        {
          name: "Side Gig",
          amountMinor: 10_000,
          cadence: "monthly",
          nextDepositDate: "2026-03-15",
        },
      ],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    const event = result.dailyTimeline
      .flatMap((d) => d.events)
      .find((e) => e.name === "Side Gig")!;
    expect(event.id).toBe("Side Gig");
  });

  it("handles empty subscriptions and no income gracefully", () => {
    const result = projectCashflow({
      startingBalanceMinor: 100_000,
      subscriptions: [],
      startDate: "2026-03-01",
      horizonDays: 30,
    });

    expect(result.totalBillsMinor).toBe(0);
    expect(result.totalIncomeMinor).toBe(0);
    expect(result.endingBalanceMinor).toBe(100_000);
    expect(result.hasDeficit).toBe(false);
    expect(result.hasBufferDip).toBe(false);
    expect(result.upcomingBillRisks).toEqual([]);
    expect(result.dailyTimeline).toHaveLength(30);
  });
});
