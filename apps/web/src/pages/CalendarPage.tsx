import type {
  CalendarEventInput,
  CalendarEventRecord,
  SubscriptionMonthItem,
  TransactionInput,
  TransactionListItem,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileUp, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { CalendarDayPanel } from "../components/calendar/CalendarDayPanel";
import { CalendarEventForm } from "../components/calendar/CalendarEventForm";
import { CalendarMonthGrid, type CalendarDayData } from "../components/calendar/CalendarMonthGrid";
import { CalendarUpcomingEvents } from "../components/calendar/CalendarUpcomingEvents";
import { AppShell } from "../components/layout/AppShell";
import { TransactionForm } from "../components/transactions/TransactionForm";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiRequestError,
  createCalendarEvent,
  createTransaction,
  deleteCalendarEvent,
  getAccounts,
  getCalendarEvents,
  getCategories,
  getSubscriptions,
  getTransactionCalendar,
  updateCalendarEvent,
} from "../lib/api";
import {
  currentMonth,
  isMonth,
  localIsoDate,
  monthStart,
  shiftMonth,
  upcomingCalendarEvents,
  upcomingCalendarSubscriptions,
} from "../lib/calendar";
import { formatFullMonth } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

function emptyCalendarDay(): CalendarDayData {
  return {
    items: [],
    subscriptions: [],
    events: [],
    incomeMinor: 0,
    expenseMinor: 0,
    incomeCount: 0,
    expenseCount: 0,
    transferCount: 0,
  };
}

function buildCalendarDays(
  items: readonly TransactionListItem[],
  subscriptions: readonly SubscriptionMonthItem[],
  events: readonly CalendarEventRecord[],
): Map<string, CalendarDayData> {
  const lookup = new Map<string, CalendarDayData>();
  for (const item of items) {
    const day = lookup.get(item.date) ?? emptyCalendarDay();
    day.items.push(item);
    if (item.kind === "income") {
      day.incomeMinor += Math.abs(item.amountMinor);
      day.incomeCount += 1;
    } else if (item.kind === "expense") {
      day.expenseMinor += Math.abs(item.amountMinor);
      day.expenseCount += 1;
    } else {
      day.transferCount += 1;
    }
    lookup.set(item.date, day);
  }

  for (const subscription of subscriptions) {
    if (subscription.status !== "active" || !subscription.billingDate) continue;
    const day = lookup.get(subscription.billingDate) ?? emptyCalendarDay();
    day.subscriptions.push(subscription);
    lookup.set(subscription.billingDate, day);
  }

  for (const event of events) {
    const day = lookup.get(event.date) ?? emptyCalendarDay();
    day.events.push(event);
    lookup.set(event.date, day);
  }

  return lookup;
}

export function CalendarPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const today = localIsoDate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const visibleMonth = isMonth(requestedMonth) ? requestedMonth : currentMonth();
  const nextMonth = shiftMonth(visibleMonth, 1);
  const [selectedDate, setSelectedDate] = useState(
    visibleMonth === currentMonth() ? today : monthStart(visibleMonth),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRecord>();

  useEffect(() => {
    setSelectedDate((current) =>
      current.startsWith(`${visibleMonth}-`) || current.startsWith(`${nextMonth}-`)
        ? current
        : visibleMonth === currentMonth()
          ? today
          : monthStart(visibleMonth),
    );
  }, [nextMonth, today, visibleMonth]);

  const calendarQuery = useQuery({
    queryKey: queryKeys.transactionCalendar(workspace, monthStart(visibleMonth)),
    queryFn: () => getTransactionCalendar(workspace, monthStart(visibleMonth)),
  });
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(visibleMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(visibleMonth)),
  });
  const eventsQuery = useQuery({
    queryKey: queryKeys.events(workspace, monthStart(visibleMonth)),
    queryFn: () => getCalendarEvents(workspace, monthStart(visibleMonth)),
  });
  const nextCalendarQuery = useQuery({
    queryKey: queryKeys.transactionCalendar(workspace, monthStart(nextMonth)),
    queryFn: () => getTransactionCalendar(workspace, monthStart(nextMonth)),
  });
  const nextSubscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(nextMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(nextMonth)),
  });
  const nextEventsQuery = useQuery({
    queryKey: queryKeys.events(workspace, monthStart(nextMonth)),
    queryFn: () => getCalendarEvents(workspace, monthStart(nextMonth)),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(workspace, true),
    queryFn: () => getCategories(workspace, true),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
  });

  const saveMutation = useMutation({
    mutationFn: (input: TransactionInput) => createTransaction(workspace, input),
    onSuccess: async () => {
      setFormOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
    },
  });
  const saveEventMutation = useMutation({
    mutationFn: ({ item, input }: { item?: CalendarEventRecord; input: CalendarEventInput }) =>
      item
        ? updateCalendarEvent(workspace, { id: item.id, input })
        : createCalendarEvent(workspace, input),
    onSuccess: async (event) => {
      setEventFormOpen(false);
      setEditingEvent(undefined);
      const eventMonth = event.date.slice(0, 7);
      if (eventMonth === visibleMonth || eventMonth === nextMonth) setSelectedDate(event.date);
      else showMonth(eventMonth, event.date);
      await queryClient.invalidateQueries({ queryKey: queryKeys.allEvents(workspace) });
    },
  });
  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => deleteCalendarEvent(workspace, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allEvents(workspace) });
    },
  });

  const days = useMemo(
    () =>
      buildCalendarDays(
        calendarQuery.data?.items ?? [],
        subscriptionsQuery.data?.items ?? [],
        eventsQuery.data?.items ?? [],
      ),
    [calendarQuery.data?.items, eventsQuery.data?.items, subscriptionsQuery.data?.items],
  );
  const nextMonthDays = useMemo(
    () =>
      buildCalendarDays(
        nextCalendarQuery.data?.items ?? [],
        nextSubscriptionsQuery.data?.items ?? [],
        nextEventsQuery.data?.items ?? [],
      ),
    [
      nextCalendarQuery.data?.items,
      nextEventsQuery.data?.items,
      nextSubscriptionsQuery.data?.items,
    ],
  );

  const selectedDay = (selectedDate.startsWith(`${nextMonth}-`) ? nextMonthDays : days).get(
    selectedDate,
  );
  const selectedItems = selectedDay?.items ?? [];
  const selectedEvents = selectedDay?.events ?? [];
  const upcomingEvents = useMemo(
    () =>
      upcomingCalendarEvents(
        [...(eventsQuery.data?.items ?? []), ...(nextEventsQuery.data?.items ?? [])],
        today,
      ),
    [eventsQuery.data?.items, nextEventsQuery.data?.items, today],
  );
  const upcomingEventsLoading =
    (eventsQuery.isPending && !eventsQuery.data) ||
    (nextEventsQuery.isPending && !nextEventsQuery.data);
  const upcomingEventsLoadError = eventsQuery.isError || nextEventsQuery.isError;
  const upcomingSubscriptions = useMemo(
    () =>
      upcomingCalendarSubscriptions(
        [...(subscriptionsQuery.data?.items ?? []), ...(nextSubscriptionsQuery.data?.items ?? [])],
        today,
      ),
    [subscriptionsQuery.data?.items, nextSubscriptionsQuery.data?.items, today],
  );
  const upcomingSubscriptionsLoading =
    (subscriptionsQuery.isPending && !subscriptionsQuery.data) ||
    (nextSubscriptionsQuery.isPending && !nextSubscriptionsQuery.data);
  const upcomingSubscriptionsLoadError =
    subscriptionsQuery.isError || nextSubscriptionsQuery.isError;

  function showMonth(month: string, date = monthStart(month)) {
    setSelectedDate(date);
    setSearchParams({ month });
  }

  function showToday() {
    showMonth(currentMonth(), today);
  }

  function openNewEvent() {
    saveEventMutation.reset();
    setEditingEvent(undefined);
    setEventFormOpen(true);
  }

  function openEvent(event: CalendarEventRecord) {
    saveEventMutation.reset();
    setEditingEvent(event);
    setEventFormOpen(true);
  }

  const currentMonthError = calendarQuery.error ?? subscriptionsQuery.error ?? eventsQuery.error;
  const largeMonthError =
    calendarQuery.error instanceof ApiRequestError &&
    calendarQuery.error.code === "calendar_month_too_large";

  return (
    <AppShell>
      <div className="dashboard-page calendar-page">
        <header className="dashboard-header calendar-header">
          <div>
            <p className="eyebrow">Daily activity</p>
            <h1>Calendar</h1>
            <p>Keep events, recurring costs, and daily transactions in one clear view.</p>
          </div>
          <div className="calendar-month-controls" aria-label="Calendar month controls">
            <button
              className="calendar-month-nav"
              type="button"
              onClick={() => showMonth(shiftMonth(visibleMonth, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={19} />
            </button>
            <strong aria-live="polite">{formatFullMonth(visibleMonth)}</strong>
            <button
              className="calendar-month-nav"
              type="button"
              onClick={() => showMonth(shiftMonth(visibleMonth, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={19} />
            </button>
            <button className="button secondary compact" type="button" onClick={showToday}>
              Today
            </button>
          </div>
        </header>

        <div className="calendar-layout">
          <section className="calendar-surface" aria-labelledby="calendar-month-title">
            <div className="calendar-surface-heading">
              <div>
                <p className="eyebrow">Month view</p>
                <h2 id="calendar-month-title">{formatFullMonth(visibleMonth)}</h2>
              </div>
              {(calendarQuery.isFetching ||
                subscriptionsQuery.isFetching ||
                eventsQuery.isFetching) && <span>Refreshing…</span>}
            </div>

            {currentMonthError ? (
              <div className="calendar-status error-state" role="alert">
                <strong>
                  {largeMonthError
                    ? "This month is too busy for the calendar view."
                    : "The calendar could not be loaded."}
                </strong>
                <span>{currentMonthError.message}</span>
                <div className="onboarding-actions">
                  {!largeMonthError && (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() =>
                        void Promise.all([
                          calendarQuery.refetch(),
                          subscriptionsQuery.refetch(),
                          eventsQuery.refetch(),
                        ])
                      }
                    >
                      Try again
                    </button>
                  )}
                  <Link className="button secondary" to="/app/transactions">
                    View transactions
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <CalendarMonthGrid
                  month={visibleMonth}
                  selectedDate={selectedDate}
                  today={today}
                  days={days}
                  onSelectDate={setSelectedDate}
                />
                {(calendarQuery.isPending ||
                  subscriptionsQuery.isPending ||
                  eventsQuery.isPending) && (
                  <div className="calendar-loading" aria-live="polite">
                    Loading daily activity…
                  </div>
                )}
              </>
            )}

            {calendarQuery.data && !calendarQuery.data.hasAnyTransactions && (
              <div className="calendar-empty-state">
                <p className="eyebrow">A clean starting point</p>
                <h3>Add your first transaction</h3>
                <p>Import a CSV or add a record manually. Your daily activity will appear here.</p>
                <div className="onboarding-actions">
                  <Link className="button primary" to="/app/import">
                    <FileUp size={16} aria-hidden="true" /> Import a CSV
                  </Link>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setFormOpen(true)}
                  >
                    <Plus size={16} aria-hidden="true" /> Add transaction
                  </button>
                </div>
              </div>
            )}
            {calendarQuery.data &&
              calendarQuery.data.hasAnyTransactions &&
              calendarQuery.data.items.length === 0 && (
                <div className="calendar-month-empty">
                  <strong>No transactions in {formatFullMonth(visibleMonth)}.</strong>
                  <span>Select a date to add one, or move to another month.</span>
                </div>
              )}

            <div className="calendar-next-month-separator" role="separator">
              <span>Next month</span>
            </div>
            <section className="calendar-next-month" aria-labelledby="calendar-next-month-title">
              <div className="calendar-next-month-heading">
                <div>
                  <p className="eyebrow">Coming up</p>
                  <h3 id="calendar-next-month-title">{formatFullMonth(nextMonth)}</h3>
                </div>
                {(nextCalendarQuery.isFetching ||
                  nextSubscriptionsQuery.isFetching ||
                  nextEventsQuery.isFetching) && <span>Refreshing…</span>}
              </div>
              {nextCalendarQuery.isError ||
              nextSubscriptionsQuery.isError ||
              nextEventsQuery.isError ? (
                <div className="calendar-status error-state" role="alert">
                  <strong>The next month could not be loaded.</strong>
                  <span>
                    {nextCalendarQuery.error?.message ??
                      nextSubscriptionsQuery.error?.message ??
                      nextEventsQuery.error?.message}
                  </span>
                </div>
              ) : (
                <>
                  <CalendarMonthGrid
                    month={nextMonth}
                    selectedDate={selectedDate}
                    today={today}
                    days={nextMonthDays}
                    onSelectDate={setSelectedDate}
                  />
                  {(nextCalendarQuery.isPending ||
                    nextSubscriptionsQuery.isPending ||
                    nextEventsQuery.isPending) && (
                    <div className="calendar-loading" aria-live="polite">
                      Loading next month…
                    </div>
                  )}
                </>
              )}
            </section>
          </section>

          <div className="calendar-side-column">
            <CalendarDayPanel
              date={selectedDate}
              items={selectedItems}
              events={selectedEvents}
              deletingEventId={
                deleteEventMutation.isPending ? deleteEventMutation.variables : undefined
              }
              deleteError={deleteEventMutation.error?.message}
              onAddTransaction={() => setFormOpen(true)}
              onAddEvent={openNewEvent}
              onEditEvent={openEvent}
              onDeleteEvent={async (id) => {
                deleteEventMutation.reset();
                await deleteEventMutation.mutateAsync(id);
              }}
            />
            <CalendarUpcomingEvents
              selectedDate={selectedDate}
              visibleMonth={visibleMonth}
              nextMonth={nextMonth}
              events={upcomingEvents}
              subscriptions={upcomingSubscriptions}
              today={today}
              isLoading={upcomingEventsLoading}
              hasLoadError={upcomingEventsLoadError}
              subscriptionsLoading={upcomingSubscriptionsLoading}
              hasSubscriptionsLoadError={upcomingSubscriptionsLoadError}
              onAddEvent={openNewEvent}
              onSelectDate={setSelectedDate}
            />
          </div>
        </div>
      </div>

      {formOpen && (
        <TransactionForm
          initialDate={selectedDate}
          categories={categoriesQuery.data ?? []}
          accounts={accountsQuery.data ?? []}
          busy={saveMutation.isPending}
          serverError={saveMutation.error?.message}
          onSubmit={async (input) => {
            await saveMutation.mutateAsync(input);
          }}
          onClose={() => {
            if (!saveMutation.isPending) setFormOpen(false);
          }}
        />
      )}
      {eventFormOpen && (
        <CalendarEventForm
          initialDate={selectedDate}
          item={editingEvent}
          busy={saveEventMutation.isPending}
          serverError={saveEventMutation.error?.message}
          onSubmit={async (input) => {
            await saveEventMutation.mutateAsync({ item: editingEvent, input });
          }}
          onClose={() => {
            if (saveEventMutation.isPending) return;
            setEventFormOpen(false);
            setEditingEvent(undefined);
          }}
        />
      )}
    </AppShell>
  );
}
