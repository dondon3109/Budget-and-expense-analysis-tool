import type { CalendarEventRecord, SubscriptionMonthItem } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import {
  calendarEventTimeLabel,
  daysInMonth,
  firstWeekday,
  monthDates,
  shiftMonth,
  upcomingCalendarEvents,
  upcomingCalendarSubscriptions,
} from "../src/lib/calendar";

function event(
  id: string,
  date: string,
  title: string,
  startTime: string | null = null,
): CalendarEventRecord {
  return { id, date, title, startTime, endTime: null, notes: null };
}

function subscription(
  id: string,
  billingDate: string | null,
  name: string,
  status: SubscriptionMonthItem["status"] = "active",
): SubscriptionMonthItem {
  return {
    id,
    name,
    amountMinor: 999_00,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate: billingDate ?? "2026-09-01",
    status,
    categoryId: "category-1",
    categoryName: "Services",
    categoryColor: "#123456",
    accountId: "account-bank",
    accountName: "Bank",
    billingDate,
    monthlyCostMinor: 999_00,
  };
}

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

  it("keeps today and later events sorted across the visible two-month range", () => {
    const events = [
      event("past", "2026-07-25", "Past event"),
      event("next", "2026-08-02", "Next month"),
      event("late", "2026-07-26", "Late", "14:00"),
      event("all-day-b", "2026-07-26", "brunch"),
      event("all-day-a", "2026-07-26", "Appointment"),
      event("early", "2026-07-26", "Early", "09:00"),
    ];

    expect(upcomingCalendarEvents(events, "2026-07-26").map(({ id }) => id)).toEqual([
      "all-day-a",
      "all-day-b",
      "early",
      "late",
      "next",
    ]);
  });

  it("formats all-day and timed event labels consistently", () => {
    expect(calendarEventTimeLabel(event("all-day", "2026-07-26", "Holiday"))).toBe("All day");
    expect(calendarEventTimeLabel(event("start", "2026-07-26", "Call", "09:05"))).toBe("9:05 AM");
    expect(
      calendarEventTimeLabel({
        ...event("range", "2026-07-26", "Workshop", "13:30"),
        endTime: "15:00",
      }),
    ).toBe("1:30 PM–3:00 PM");
  });

  it("keeps active subscription occurrences due today or later in deterministic order", () => {
    const subscriptions = [
      subscription("past", "2026-07-25", "Past"),
      subscription("canceled", "2026-07-30", "Canceled", "canceled"),
      subscription("not-due", null, "Yearly later"),
      subscription("repeat", "2026-08-26", "Streaming"),
      subscription("same-b", "2026-07-26", "utilities"),
      subscription("same-a", "2026-07-26", "Cloud storage"),
      subscription("repeat", "2026-07-28", "Streaming"),
    ];
    const originalOrder = subscriptions.map(({ id, billingDate }) => `${id}:${billingDate}`);

    expect(
      upcomingCalendarSubscriptions(subscriptions, "2026-07-26").map(
        ({ id, billingDate }) => `${id}:${billingDate}`,
      ),
    ).toEqual(["same-a:2026-07-26", "same-b:2026-07-26", "repeat:2026-07-28", "repeat:2026-08-26"]);
    expect(subscriptions.map(({ id, billingDate }) => `${id}:${billingDate}`)).toEqual(
      originalOrder,
    );
  });
});
