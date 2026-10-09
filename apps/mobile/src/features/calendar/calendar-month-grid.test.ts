import { calendarMonthWeeks } from "./calendar-month-grid";

describe("calendar month grid", () => {
  it("completes August 2026 with the neighbouring months' days", () => {
    const weeks = calendarMonthWeeks("2026-08-01");

    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
    expect(weeks[5]?.slice(0, 2)).toEqual(["2026-08-30", "2026-08-31"]);
    expect(weeks[5]?.[2]).toBe("2026-09-01");
  });

  it("keeps leap-day months complete and uses only the weeks it needs", () => {
    const weeks = calendarMonthWeeks("2028-02-01");

    expect(weeks.flat()).toContain("2028-02-29");
    expect(weeks).toHaveLength(5);
  });

  it("fails closed for a non-month value", () => {
    expect(calendarMonthWeeks("2026-08-20")).toEqual([]);
    expect(calendarMonthWeeks("2026-13-01")).toEqual([]);
  });
});
