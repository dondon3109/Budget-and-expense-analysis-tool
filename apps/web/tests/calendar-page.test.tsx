// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CalendarEventInput } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getTransactionCalendar: vi.fn(),
  getSubscriptions: vi.fn(),
  getCalendarEvents: vi.fn(),
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  createTransaction: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/calendar/CalendarDayPanel", () => ({
  CalendarDayPanel: ({ date }: { date: string }) => <aside>Selected date: {date}</aside>,
}));

vi.mock("../src/components/transactions/TransactionForm", () => ({
  TransactionForm: () => null,
}));

vi.mock("../src/components/calendar/CalendarEventForm", () => ({
  CalendarEventForm: ({
    initialDate,
    onSubmit,
  }: {
    initialDate: string;
    onSubmit: (input: {
      title: string;
      date: string;
      startTime: null;
      endTime: null;
      notes: null;
    }) => Promise<void>;
  }) => (
    <div role="dialog">
      Event form date: {initialDate}
      <button
        type="button"
        onClick={() =>
          void onSubmit({
            title: "Dentist",
            date: initialDate,
            startTime: null,
            endTime: null,
            notes: null,
          })
        }
      >
        Submit event mock
      </button>
    </div>
  ),
}));

vi.mock("../src/lib/api", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    code = "test_error";
  },
  ...apiMocks,
}));

import { CalendarPage } from "../src/pages/CalendarPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/calendar?month=2026-07"]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CalendarPage month views", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-26T12:00:00"));
    apiMocks.getTransactionCalendar.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        currency: "PHP",
        items: [],
        hasAnyTransactions: false,
      }),
    );
    apiMocks.getSubscriptions.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        currency: "PHP",
        totalMonthlyCostMinor: 0,
        items: [],
      }),
    );
    apiMocks.getCalendarEvents.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        items: [],
      }),
    );
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.createTransaction.mockReset();
    apiMocks.createCalendarEvent
      .mockReset()
      .mockImplementation((_: unknown, input: CalendarEventInput) =>
        Promise.resolve({
          id: "event-1",
          ...input,
        }),
      );
    apiMocks.updateCalendarEvent.mockReset();
    apiMocks.deleteCalendarEvent.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the following month below a separator inside the clipped calendar surface", async () => {
    const { container } = renderPage();

    expect(await screen.findByRole("grid", { name: "Calendar for 2026-07" })).toBeVisible();
    expect(screen.getByRole("separator")).toHaveTextContent("Next month");
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeVisible();
    expect(screen.getByRole("grid", { name: "Calendar for 2026-08" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add Event" })).toBeVisible();

    const surface = container.querySelector(".calendar-surface");
    expect(surface).toContainElement(screen.getByRole("separator"));
    expect(apiMocks.getTransactionCalendar).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      "2026-08-01",
    );
  });

  it("selects a next-month date without navigating away from the current month", async () => {
    renderPage();
    const augustFifth = await screen.findByRole("button", { name: /August 5, 2026/i });

    fireEvent.click(augustFifth);

    await waitFor(() => expect(screen.getByText("Selected date: 2026-08-05")).toBeVisible());
    expect(
      screen.getByLabelText("Calendar month controls").querySelector("strong"),
    ).toHaveTextContent("July 2026");
    expect(screen.getByRole("grid", { name: "Calendar for 2026-07" })).toBeVisible();
    expect(screen.getByRole("grid", { name: "Calendar for 2026-08" })).toBeVisible();
    expect(screen.queryByRole("grid", { name: "Calendar for 2026-09" })).not.toBeInTheDocument();
    expect(screen.getByText(/Plan an activity for .*August 5, 2026/i)).toBeVisible();
  });

  it("opens the event form for the selected next-month date", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /August 5, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Event form date: 2026-08-05");
    expect(apiMocks.getCalendarEvents).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      "2026-08-01",
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit event mock" }));
    await waitFor(() =>
      expect(apiMocks.createCalendarEvent).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        {
          title: "Dentist",
          date: "2026-08-05",
          startTime: null,
          endTime: null,
          notes: null,
        },
      ),
    );
  });

  it("shows future events from the current and next month in chronological order", async () => {
    apiMocks.getCalendarEvents.mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        items:
          month === "2026-07-01"
            ? [
                {
                  id: "past",
                  title: "Already happened",
                  date: "2026-07-25",
                  startTime: null,
                  endTime: null,
                  notes: null,
                },
                {
                  id: "today",
                  title: "Today all day",
                  date: "2026-07-26",
                  startTime: null,
                  endTime: null,
                  notes: null,
                },
                {
                  id: "current",
                  title: "Current month appointment",
                  date: "2026-07-30",
                  startTime: "09:30",
                  endTime: null,
                  notes: null,
                },
              ]
            : [
                {
                  id: "next",
                  title: "Next month meeting",
                  date: "2026-08-05",
                  startTime: "14:00",
                  endTime: "15:00",
                  notes: null,
                },
              ],
      }),
    );

    renderPage();

    const upcoming = await screen.findByRole("list", {
      name: /Upcoming events for July 2026–August 2026/i,
    });
    const eventButtons = Array.from(upcoming.querySelectorAll("button"));
    expect(eventButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Today all day"),
      expect.stringContaining("Current month appointment"),
      expect.stringContaining("Next month meeting"),
    ]);
    expect(within(upcoming).queryByText("Already happened")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /View Next month meeting on .*August 5, 2026, 2:00 PM–3:00 PM/i,
      }),
    );

    await waitFor(() => expect(screen.getByText("Selected date: 2026-08-05")).toBeVisible());
    expect(
      screen.getByLabelText("Calendar month controls").querySelector("strong"),
    ).toHaveTextContent("July 2026");
  });

  it("keeps loaded upcoming events visible when one month fails", async () => {
    apiMocks.getCalendarEvents.mockImplementation((_, month: string) =>
      month === "2026-08-01"
        ? Promise.reject(new Error("August unavailable"))
        : Promise.resolve({
            month,
            items: [
              {
                id: "current",
                title: "Current month event",
                date: "2026-07-30",
                startTime: null,
                endTime: null,
                notes: null,
              },
            ],
          }),
    );

    renderPage();

    expect(await screen.findByRole("button", { name: /View Current month event/i })).toBeVisible();
    expect(screen.getByText("Some upcoming events could not be loaded.")).toBeVisible();
  });

  it("shows active subscriptions to pay across the current and next month", async () => {
    apiMocks.getSubscriptions.mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        currency: "PHP",
        totalMonthlyCostMinor: 0,
        items:
          month === "2026-07-01"
            ? [
                {
                  id: "past",
                  name: "Past subscription",
                  amountMinor: 100_00,
                  currency: "PHP",
                  billingCycle: "monthly",
                  nextBillingDate: "2026-07-25",
                  status: "active",
                  categoryId: "category-1",
                  categoryName: "Services",
                  categoryColor: "#123456",
                  billingDate: "2026-07-25",
                  monthlyCostMinor: 100_00,
                },
                {
                  id: "streaming",
                  name: "Streaming plan",
                  amountMinor: 549_00,
                  currency: "PHP",
                  billingCycle: "monthly",
                  nextBillingDate: "2026-07-26",
                  status: "active",
                  categoryId: "category-2",
                  categoryName: "Entertainment",
                  categoryColor: "#654321",
                  billingDate: "2026-07-26",
                  monthlyCostMinor: 549_00,
                },
                {
                  id: "yearly",
                  name: "Annual productivity suite",
                  amountMinor: 12_000_00,
                  currency: "PHP",
                  billingCycle: "yearly",
                  nextBillingDate: "2026-07-30",
                  status: "active",
                  categoryId: "category-3",
                  categoryName: "Productivity",
                  categoryColor: "#abcdef",
                  billingDate: "2026-07-30",
                  monthlyCostMinor: 1_000_00,
                },
                {
                  id: "canceled",
                  name: "Canceled plan",
                  amountMinor: 300_00,
                  currency: "PHP",
                  billingCycle: "monthly",
                  nextBillingDate: "2026-07-28",
                  status: "canceled",
                  categoryId: "category-1",
                  categoryName: "Services",
                  categoryColor: "#123456",
                  billingDate: "2026-07-28",
                  monthlyCostMinor: 300_00,
                },
                {
                  id: "yearly-later",
                  name: "Not billed this month",
                  amountMinor: 800_00,
                  currency: "PHP",
                  billingCycle: "yearly",
                  nextBillingDate: "2026-09-01",
                  status: "active",
                  categoryId: "category-1",
                  categoryName: "Services",
                  categoryColor: "#123456",
                  billingDate: null,
                  monthlyCostMinor: 67_00,
                },
              ]
            : [
                {
                  id: "streaming",
                  name: "Streaming plan",
                  amountMinor: 549_00,
                  currency: "PHP",
                  billingCycle: "monthly",
                  nextBillingDate: "2026-07-26",
                  status: "active",
                  categoryId: "category-2",
                  categoryName: "Entertainment",
                  categoryColor: "#654321",
                  billingDate: "2026-08-26",
                  monthlyCostMinor: 549_00,
                },
              ],
      }),
    );

    renderPage();

    const list = await screen.findByRole("list", {
      name: /Subscriptions to pay for July 2026–August 2026/i,
    });
    const rows = Array.from(list.querySelectorAll("button"));
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Due todayStreaming plan"),
      expect.stringContaining("Jul 30Annual productivity suite"),
      expect.stringContaining("Aug 26Streaming plan"),
    ]);
    expect(within(list).getByText("₱12,000")).toBeVisible();
    expect(within(list).getByText("Yearly · Productivity")).toBeVisible();
    expect(within(list).queryByText("Past subscription")).not.toBeInTheDocument();
    expect(within(list).queryByText("Canceled plan")).not.toBeInTheDocument();
    expect(within(list).queryByText("Not billed this month")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /View Streaming plan, due Wednesday, August 26, 2026, ₱549/i,
      }),
    );
    await waitFor(() => expect(screen.getByText("Selected date: 2026-08-26")).toBeVisible());
    expect(
      screen.getByLabelText("Calendar month controls").querySelector("strong"),
    ).toHaveTextContent("July 2026");
  });

  it("keeps loaded subscriptions visible when the next month fails", async () => {
    apiMocks.getSubscriptions.mockImplementation((_, month: string) =>
      month === "2026-08-01"
        ? Promise.reject(new Error("August subscriptions unavailable"))
        : Promise.resolve({
            month,
            currency: "PHP",
            totalMonthlyCostMinor: 499_00,
            items: [
              {
                id: "current-subscription",
                name: "Current subscription",
                amountMinor: 499_00,
                currency: "PHP",
                billingCycle: "monthly",
                nextBillingDate: "2026-07-30",
                status: "active",
                categoryId: "category-1",
                categoryName: "Services",
                categoryColor: "#123456",
                billingDate: "2026-07-30",
                monthlyCostMinor: 499_00,
              },
            ],
          }),
    );

    renderPage();

    expect(
      await screen.findByRole("button", { name: /View Current subscription, due/i }),
    ).toBeVisible();
    expect(screen.getByText("Some subscription due dates could not be loaded.")).toBeVisible();
  });
});
