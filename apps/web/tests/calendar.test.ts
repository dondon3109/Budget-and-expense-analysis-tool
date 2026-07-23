import { describe, expect, it } from "vitest";

import { daysInMonth, firstWeekday, monthDates, shiftMonth } from "../src/lib/calendar";

describe("calendar utilities", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("handles leap-year February", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthDates("2028-02")).toHaveLength(29);
  });

  it("returns the month opening weekday", () => {
    expect(firstWeekday("2026-07")).toBe(3);
  });
});
