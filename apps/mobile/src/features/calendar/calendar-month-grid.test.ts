import { calendarMonthCells } from "./calendar-month-grid";

describe("calendar month grid", () => {
  it("includes every August 2026 date and completes both calendar weeks", () => {
    const cells = calendarMonthCells("2026-08-01");

    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe("2026-08-01");
    expect(cells[36]).toBe("2026-08-31");
    expect(cells.slice(37)).toEqual([null, null, null, null, null]);
  });

  it("keeps leap-day months complete", () => {
    const cells = calendarMonthCells("2028-02-01");

    expect(cells).toContain("2028-02-29");
    expect(cells.filter((cell) => cell !== null)).toHaveLength(29);
    expect(cells).toHaveLength(35);
  });

  it("fails closed for a non-month value", () => {
    expect(calendarMonthCells("2026-08-20")).toEqual([]);
    expect(calendarMonthCells("2026-13-01")).toEqual([]);
  });
});
