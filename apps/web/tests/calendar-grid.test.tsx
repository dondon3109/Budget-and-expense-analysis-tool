// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarMonthGrid } from "../src/components/calendar/CalendarMonthGrid";

afterEach(cleanup);

describe("CalendarMonthGrid", () => {
  it("renders daily money indicators and selects a day", () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-01"
        today="2026-07-18"
        days={
          new Map([
            [
              "2026-07-18",
              {
                items: [],
                subscriptions: [],
                events: [],
                incomeByCurrency: { PHP: 500_000, USD: 0 },
                expenseByCurrency: { PHP: 125_00, USD: 0 },
                incomeCount: 1,
                expenseCount: 2,
                transferCount: 0,
              },
            ],
          ])
        }
        onSelectDate={onSelectDate}
      />,
    );

    const day = screen.getByRole("button", {
      name: /July 18, 2026, today, 1 money in transaction/i,
    });
    fireEvent.click(day);
    expect(onSelectDate).toHaveBeenCalledWith("2026-07-18");
  });

  it("shows paid subscriptions in green and upcoming subscriptions in red", () => {
    const subscription = {
      id: "subscription-1",
      name: "Netflix",
      amountMinor: 549_00,
      currency: "PHP" as const,
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-07-20",
      status: "active" as const,
      categoryId: "category-1",
      categoryName: "Entertainment",
      categoryColor: "#123456",
      accountId: "account-bank",
      accountName: "Bank",
      billingDate: "2026-07-20",
      monthlyCostMinor: 549_00,
    };
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-23"
        today="2026-07-23"
        days={
          new Map([
            [
              "2026-07-20",
              {
                items: [],
                subscriptions: [subscription],
                events: [],
                incomeByCurrency: { PHP: 0, USD: 0 },
                expenseByCurrency: { PHP: 0, USD: 0 },
                incomeCount: 0,
                expenseCount: 0,
                transferCount: 0,
              },
            ],
            [
              "2026-07-29",
              {
                items: [],
                subscriptions: [
                  {
                    ...subscription,
                    id: "subscription-2",
                    name: "Spotify",
                    billingDate: "2026-07-29",
                  },
                ],
                events: [],
                incomeByCurrency: { PHP: 0, USD: 0 },
                expenseByCurrency: { PHP: 0, USD: 0 },
                incomeCount: 0,
                expenseCount: 0,
                transferCount: 0,
              },
            ],
          ])
        }
        onSelectDate={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Netflix · Paid")).toHaveClass("paid");
    expect(screen.getByTitle("Spotify · Upcoming")).toHaveClass("due");
  });

  it("shows events in the day cell and accessible label", () => {
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-01"
        today="2026-07-18"
        days={
          new Map([
            [
              "2026-07-22",
              {
                items: [],
                subscriptions: [],
                events: [
                  {
                    id: "event-1",
                    title: "Dentist",
                    date: "2026-07-22",
                    startTime: "09:30",
                    endTime: null,
                    notes: null,
                  },
                ],
                incomeByCurrency: { PHP: 0, USD: 0 },
                expenseByCurrency: { PHP: 0, USD: 0 },
                incomeCount: 0,
                expenseCount: 0,
                transferCount: 0,
              },
            ],
          ])
        }
        onSelectDate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /1 event: Dentist/i })).toBeVisible();
    expect(screen.getByTitle("Dentist")).toHaveClass("event");
  });

  it("keeps outer-column dates fully selectable", () => {
    const onSelectDate = vi.fn();
    const { rerender } = render(
      <CalendarMonthGrid
        month="2026-05"
        selectedDate="2026-05-31"
        today="2026-05-15"
        days={new Map()}
        onSelectDate={onSelectDate}
      />,
    );

    const bottomLeftDate = screen.getByRole("button", {
      name: /May 31, 2026, selected/i,
    });
    expect(bottomLeftDate).toHaveClass("selected");
    expect(bottomLeftDate).toHaveAttribute("aria-pressed", "true");

    rerender(
      <CalendarMonthGrid
        month="2026-10"
        selectedDate="2026-10-31"
        today="2026-10-15"
        days={new Map()}
        onSelectDate={onSelectDate}
      />,
    );

    const bottomRightDate = screen.getByRole("button", {
      name: /October 31, 2026, selected/i,
    });
    expect(bottomRightDate).toHaveClass("selected");
    expect(bottomRightDate).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(bottomRightDate);
    expect(onSelectDate).toHaveBeenCalledWith("2026-10-31");
  });

  it("builds a grid of week rows with seven cells each", () => {
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-01"
        today="2026-07-18"
        days={new Map()}
        onSelectDate={vi.fn()}
      />,
    );

    const grid = screen.getByRole("grid", { name: "Calendar for 2026-07" });
    // The defect this pins: gridcells and columnheaders sat directly under the grid, with no
    // role="row" between them, which is not a structure assistive technology can navigate.
    expect(
      Array.from(grid.children).some((child) => child.getAttribute("role") === "gridcell"),
    ).toBe(false);

    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(6); // one weekday header row plus five week rows
    expect(within(rows[0]!).getAllByRole("columnheader")).toHaveLength(7);
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("gridcell")).toHaveLength(7);
    }
  });

  it("gives a grid with no selection of its own a tab stop", () => {
    render(
      <CalendarMonthGrid
        month="2026-08"
        selectedDate="2026-07-15"
        today="2026-07-18"
        days={new Map()}
        onSelectDate={vi.fn()}
      />,
    );

    // CalendarPage opens a second grid on the next month. Only the selected day used to be
    // tabbable, so with the selection in the first grid every cell of the second was tabIndex={-1}.
    const tabbable = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName(/August 1, 2026/);
  });

  it("moves focus selection by week with the keyboard", () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-08"
        today="2026-07-18"
        days={new Map()}
        onSelectDate={onSelectDate}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /July 8, 2026, selected/i }), {
      key: "ArrowDown",
    });
    expect(onSelectDate).toHaveBeenCalledWith("2026-07-15");
  });
});
