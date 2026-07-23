// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
                incomeMinor: 500_000,
                expenseMinor: 125_00,
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
                incomeMinor: 0,
                expenseMinor: 0,
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
                incomeMinor: 0,
                expenseMinor: 0,
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
