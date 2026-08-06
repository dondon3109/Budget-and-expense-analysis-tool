import { describe, expect, it } from "vitest";

import { daysInMonth, interestAmountMinor, isInterestCreditDay, manilaDate } from "../src/interest/credit";

describe("manilaDate", () => {
  it("formats an instant as an Asia/Manila YYYY-MM-DD date", () => {
    // 2026-08-06 16:30 UTC is already 2026-08-07 in Manila (UTC+8).
    const when = new Date("2026-08-06T16:30:00Z");
    expect(manilaDate(when)).toBe("2026-08-07");
  });

  it("keeps dates before midnight Manila on the same day", () => {
    // 2026-08-06 12:00 UTC = 2026-08-06 20:00 Manila.
    const when = new Date("2026-08-06T12:00:00Z");
    expect(manilaDate(when)).toBe("2026-08-06");
  });
});

describe("daysInMonth", () => {
  it("returns the correct day counts", () => {
    expect(daysInMonth("2026-02-01")).toBe(28);
    expect(daysInMonth("2028-02-01")).toBe(29);
    expect(daysInMonth("2026-04-01")).toBe(30);
    expect(daysInMonth("2026-01-01")).toBe(31);
  });
});

describe("isInterestCreditDay", () => {
  it("credits every day for daily interest", () => {
    expect(isInterestCreditDay("daily", null, "2026-08-15")).toBe(true);
    expect(isInterestCreditDay("daily", 31, "2026-08-01")).toBe(true);
  });

  it("credits monthly on the pay day", () => {
    expect(isInterestCreditDay("monthly", 15, "2026-08-15")).toBe(true);
    expect(isInterestCreditDay("monthly", 15, "2026-08-14")).toBe(false);
  });

  it("clamps the pay day to the month length for monthly interest", () => {
    // Pay day 31 in a 30-day month should land on the last day; and 31 in a 28-day Feb.
    expect(isInterestCreditDay("monthly", 31, "2026-04-30")).toBe(true);
    expect(isInterestCreditDay("monthly", 31, "2026-02-28")).toBe(true);
    expect(isInterestCreditDay("monthly", 31, "2026-04-29")).toBe(false);
  });

  it("treats a missing pay day as never due for monthly/yearly", () => {
    expect(isInterestCreditDay("monthly", null, "2026-08-15")).toBe(false);
    expect(isInterestCreditDay("yearly", null, "2026-08-15")).toBe(false);
  });
});

describe("interestAmountMinor", () => {
  it("computes daily interest from an annual rate", () => {
    // ₱10,000.00 (1,000,000 minor) at 5.00% p.a. → 1000000*0.05/365 ≈ 136.98 → floor 136.
    expect(interestAmountMinor(1_000_000, 500, "daily")).toBe(136);
  });

  it("computes monthly interest", () => {
    // 1000000*0.05/12 = 4166.66 → floor 4166.
    expect(interestAmountMinor(1_000_000, 500, "monthly")).toBe(4166);
  });

  it("computes yearly interest", () => {
    expect(interestAmountMinor(1_000_000, 500, "yearly")).toBe(50000);
  });

  it("floors small balances to zero rather than rounding up", () => {
    expect(interestAmountMinor(100, 500, "daily")).toBe(0);
  });

  it("works off the absolute balance for negative balances", () => {
    expect(interestAmountMinor(-1_000_000, 500, "monthly")).toBe(4166);
  });
});
