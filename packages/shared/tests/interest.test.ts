import { describe, expect, it } from "vitest";

import {
  daysInMonth,
  interestAmountMinor,
  isInterestCreditDay,
  manilaDate,
  nextInterestCreditDate,
} from "../src/interest";

describe("manilaDate", () => {
  it("formats UTC instants as Manila calendar dates", () => {
    expect(manilaDate(new Date("2026-08-07T08:00:00Z"))).toBe("2026-08-07");
    expect(manilaDate(new Date("2026-08-06T16:30:00Z"))).toBe("2026-08-07");
    expect(manilaDate(new Date("2026-08-06T15:59:59Z"))).toBe("2026-08-06");
  });
});

describe("daysInMonth", () => {
  it("returns calendar month lengths including leap years", () => {
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

  it("clamps the pay day to the month length", () => {
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
    expect(interestAmountMinor(1_000_000, 500, "daily")).toBe(136);
  });

  it("computes monthly interest", () => {
    expect(interestAmountMinor(1_000_000, 500, "monthly")).toBe(4166);
  });

  it("computes yearly interest", () => {
    expect(interestAmountMinor(1_000_000, 500, "yearly")).toBe(50000);
  });

  it("floors small balances to zero", () => {
    expect(interestAmountMinor(100, 500, "daily")).toBe(0);
  });

  it("works off the absolute balance for negative balances", () => {
    expect(interestAmountMinor(-1_000_000, 500, "monthly")).toBe(4166);
  });
});

describe("nextInterestCreditDate", () => {
  it("returns the following day for daily interest", () => {
    expect(nextInterestCreditDate("daily", null, "2026-08-07")).toBe("2026-08-08");
  });

  it("returns the pay day later in the same month", () => {
    expect(nextInterestCreditDate("monthly", 15, "2026-08-07")).toBe("2026-08-15");
  });

  it("rolls to the next month once the pay day passed", () => {
    expect(nextInterestCreditDate("monthly", 15, "2026-08-15")).toBe("2026-09-15");
    expect(nextInterestCreditDate("monthly", 15, "2026-08-31")).toBe("2026-09-15");
  });

  it("clamps short months like the server credit day", () => {
    expect(nextInterestCreditDate("monthly", 31, "2026-01-31")).toBe("2026-02-28");
    expect(nextInterestCreditDate("monthly", 31, "2026-01-20")).toBe("2026-01-31");
  });

  it("crosses year boundaries", () => {
    expect(nextInterestCreditDate("monthly", 15, "2026-12-20")).toBe("2027-01-15");
    expect(nextInterestCreditDate("yearly", 15, "2026-12-20")).toBe("2027-01-15");
  });

  it("returns null when a monthly/yearly pay day is missing", () => {
    expect(nextInterestCreditDate("monthly", null, "2026-08-07")).toBeNull();
    expect(nextInterestCreditDate("yearly", null, "2026-08-07")).toBeNull();
  });
});
