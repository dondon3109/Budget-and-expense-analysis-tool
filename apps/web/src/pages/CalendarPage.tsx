import type { TransactionInput } from "@budget/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileUp, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { CalendarMonthGrid, type CalendarDayData } from "../components/calendar/CalendarMonthGrid";
import { CalendarDayPanel } from "../components/calendar/CalendarDayPanel";
import { AppShell } from "../components/layout/AppShell";
import { TransactionForm } from "../components/transactions/TransactionForm";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiRequestError,
  createTransaction,
  getAccounts,
  getCategories,
  getSubscriptions,
  getTransactionCalendar,
} from "../lib/api";
import { currentMonth, isMonth, localIsoDate, monthStart, shiftMonth } from "../lib/calendar";
import { formatFullMonth } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

export function CalendarPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const today = localIsoDate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const visibleMonth = isMonth(requestedMonth) ? requestedMonth : currentMonth();
  const [selectedDate, setSelectedDate] = useState(
    visibleMonth === currentMonth() ? today : monthStart(visibleMonth),
  );
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!selectedDate.startsWith(`${visibleMonth}-`)) {
      setSelectedDate(visibleMonth === currentMonth() ? today : monthStart(visibleMonth));
    }
  }, [selectedDate, today, visibleMonth]);

  const calendarQuery = useQuery({
    queryKey: queryKeys.transactionCalendar(workspace, monthStart(visibleMonth)),
    queryFn: () => getTransactionCalendar(workspace, monthStart(visibleMonth)),
  });
  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart(visibleMonth)),
    queryFn: () => getSubscriptions(workspace, monthStart(visibleMonth)),
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

  const days = useMemo(() => {
    const lookup = new Map<string, CalendarDayData>();
    for (const item of calendarQuery.data?.items ?? []) {
      const day = lookup.get(item.date) ?? {
        items: [],
        subscriptions: [],
        incomeMinor: 0,
        expenseMinor: 0,
        incomeCount: 0,
        expenseCount: 0,
        transferCount: 0,
      };
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

    for (const subscription of subscriptionsQuery.data?.items ?? []) {
      if (subscription.status !== "active" || !subscription.billingDate) continue;
      const day = lookup.get(subscription.billingDate) ?? {
        items: [],
        subscriptions: [],
        incomeMinor: 0,
        expenseMinor: 0,
        incomeCount: 0,
        expenseCount: 0,
        transferCount: 0,
      };
      day.subscriptions.push(subscription);
      lookup.set(subscription.billingDate, day);
    }
    return lookup;
  }, [calendarQuery.data?.items, subscriptionsQuery.data?.items]);

  const selectedItems = days.get(selectedDate)?.items ?? [];

  function showMonth(month: string, date = monthStart(month)) {
    setSelectedDate(date);
    setSearchParams({ month });
  }

  function showToday() {
    showMonth(currentMonth(), today);
  }

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
            <p>See when money moved and open any day for its transaction details.</p>
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
              {calendarQuery.isFetching && <span>Refreshing…</span>}
            </div>

            {calendarQuery.isError ? (
              <div className="calendar-status error-state" role="alert">
                <strong>
                  {largeMonthError
                    ? "This month is too busy for the calendar view."
                    : "The calendar could not be loaded."}
                </strong>
                <span>{calendarQuery.error.message}</span>
                <div className="onboarding-actions">
                  {!largeMonthError && (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => void calendarQuery.refetch()}
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
                {calendarQuery.isPending && (
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
          </section>

          <CalendarDayPanel
            date={selectedDate}
            items={selectedItems}
            onAddTransaction={() => setFormOpen(true)}
          />
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
    </AppShell>
  );
}
