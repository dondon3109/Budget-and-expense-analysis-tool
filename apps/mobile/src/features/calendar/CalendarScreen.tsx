import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSessionSnapshot } from "@/auth/session-state";
import {
  useBudgetOccasions,
  useBudgetPlan,
  useCalendarMonth,
  useLocalWorkspace,
} from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import type { LocalBudgetOccasion, LocalCalendarDay } from "@/db/view-models";
import { ErrorState, MoneyValue, Skeleton, SyncStatus } from "@/ui/components";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { buildBudgetMonthView } from "../budgets/budget-month-view";
import { monthTotals } from "./calendar-day-summary";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { monthLabel, todayIso } from "./event-form";
import { withTapSound } from "@/features/sounds/sound-effects";

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

function currentMonthStart(): string {
  return todayIso().slice(0, 8) + "01";
}

function shiftMonth(month: string, delta: number): string {
  const date = new Date(month + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

function dayTitle(date: string): string {
  const parsed = new Date(date + "T00:00:00Z");
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The month's income, spending, and what its budget has left, as three plain columns. */
function MonthSummary({
  incomeMinor,
  expenseMinor,
  budgetLeftMinor,
}: {
  incomeMinor: number;
  expenseMinor: number;
  budgetLeftMinor: number | null;
}) {
  const theme = useZoptionTheme();
  const columns = [
    { label: "Income", amountMinor: incomeMinor, tone: "income" as const },
    { label: "Expenses", amountMinor: expenseMinor, tone: "expense" as const },
    {
      label: "Budget left",
      amountMinor: budgetLeftMinor ?? 0,
      tone:
        budgetLeftMinor !== null && budgetLeftMinor < 0
          ? ("expense" as const)
          : ("default" as const),
      empty: budgetLeftMinor === null,
    },
  ];
  return (
    <View style={styles.summary}>
      {columns.map((column) => (
        <View key={column.label} style={styles.summaryColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {column.label}
          </Text>
          {column.empty ? (
            <Text style={[typography.headline, { color: theme.colors.textMuted }]}>—</Text>
          ) : (
            <MoneyValue
              amountMinor={column.amountMinor}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              style={styles.summaryAmount}
              tone={column.tone}
            />
          )}
        </View>
      ))}
    </View>
  );
}

/** The selected day as ruled rows under the grid: occasion budgets, events, bills, activity. */
function DayAgenda({
  date,
  day,
  occasions,
}: {
  date: string;
  day?: LocalCalendarDay;
  occasions: readonly LocalBudgetOccasion[];
}) {
  const theme = useZoptionTheme();
  const rule = { borderBottomColor: theme.colors.border };
  const hasContent =
    occasions.length > 0 ||
    (day !== undefined &&
      (day.events.length > 0 || day.transactions.length > 0 || day.subscriptionBills.length > 0));
  return (
    <View accessibilityLabel={`Agenda for ${date}`} style={styles.agenda}>
      <Text
        accessibilityRole="header"
        style={[typography.headline, styles.agendaTitle, { color: theme.colors.text }]}
      >
        {dayTitle(date)}
      </Text>
      {!hasContent ? (
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          No events, bills, or transactions on this day.
        </Text>
      ) : null}
      {occasions.map((occasion) => {
        const left = occasion.totalLimitMinor - occasion.totalSpentMinor;
        return (
          <Pressable
            key={occasion.eventId}
            accessibilityHint="Opens this occasion's budget"
            accessibilityLabel={`Occasion budget ${occasion.title}`}
            accessibilityRole="button"
            android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
            onPress={withTapSound(() =>
              router.push({
                pathname: "/(app)/(tabs)/budgets",
                params: { occasion: occasion.eventId },
              })
            )}
            style={[styles.agendaRow, rule]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.brand}
              name="party-popper"
              size={20}
            />
            <View style={styles.agendaText}>
              <Text style={[typography.body, { color: theme.colors.text }]}>{occasion.title}</Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Budget · {left < 0 ? "over by" : "left"}
              </Text>
            </View>
            <MoneyValue
              amountMinor={Math.abs(left)}
              style={styles.agendaAmount}
              tone={left < 0 ? "expense" : "default"}
            />
          </Pressable>
        );
      })}
      {day?.events.map((event) => (
        <Pressable
          key={event.id}
          accessibilityHint="Opens the event editor"
          accessibilityRole="button"
          accessibilityLabel={"Event " + event.title}
          android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
          onPress={withTapSound(() => router.push({ pathname: "/(app)/event", params: { id: event.id } }))}
          style={[styles.agendaRow, rule]}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.brand}
            name="calendar-blank-outline"
            size={20}
          />
          <View style={styles.agendaText}>
            <Text style={[typography.body, { color: theme.colors.text }]}>{event.title}</Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {event.startTime
                ? event.startTime + (event.endTime ? "–" + event.endTime : "")
                : "All day"}
              {event.syncState !== "synced" ? " · " + event.syncState : ""}
            </Text>
          </View>
        </Pressable>
      ))}
      {day?.subscriptionBills.map((bill) => (
        <View key={bill.id} style={[styles.agendaRow, rule]}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.warning}
            name="credit-card-clock-outline"
            size={20}
          />
          <View style={styles.agendaText}>
            <Text style={[typography.body, { color: theme.colors.text }]}>{bill.name}</Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Billing day</Text>
          </View>
          <MoneyValue
            amountMinor={bill.amountMinor}
            currency={bill.currency}
            style={styles.agendaAmount}
          />
        </View>
      ))}
      {day?.transactions.map((transaction) => (
        <View key={transaction.id} style={[styles.agendaRow, rule]}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.textMuted}
            name="swap-vertical"
            size={20}
          />
          <View style={styles.agendaText}>
            <Text style={[typography.body, { color: theme.colors.text }]}>
              {transaction.description}
            </Text>
          </View>
          <MoneyValue
            amountMinor={transaction.amountMinor}
            style={styles.agendaAmount}
            tone={
              transaction.kind === "transfer"
                ? "default"
                : transaction.kind === "income"
                  ? "income"
                  : "expense"
            }
          />
        </View>
      ))}
    </View>
  );
}

export function CalendarScreen() {
  const [month, setMonth] = useState(() => currentMonthStart());
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const state = useCalendarMonth(month);
  const budgetPlan = useBudgetPlan({ scope: "month", month });
  const occasions = useBudgetOccasions(month);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const guest = useSessionSnapshot().status === "guest";
  const theme = useZoptionTheme();

  const days = useMemo(
    () => new Map((state.month?.days ?? []).map((day) => [day.date, day])),
    [state.month],
  );
  const totals = useMemo(() => monthTotals(state.month?.days ?? []), [state.month]);
  const budgetView = useMemo(
    () => (budgetPlan.data ? buildBudgetMonthView(budgetPlan.data) : null),
    [budgetPlan.data],
  );
  const selectedDay = days.get(selectedDate);
  const selectedOccasions = occasions.occasions.filter(
    (occasion) => occasion.date === selectedDate,
  );
  const isCurrentMonth = month === currentMonthStart();

  function changeMonth(delta: number) {
    const nextMonth = shiftMonth(month, delta);
    setMonth(nextMonth);
    setSelectedDate(nextMonth);
  }

  function goToToday() {
    setMonth(currentMonthStart());
    setSelectedDate(todayIso());
  }

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: "Calendar" }} />
      <View style={styles.monthNav}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: true }}
          onPress={withTapSound(() => changeMonth(-1))}
          style={styles.monthButton}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.text}
            name="chevron-left"
            size={26}
          />
        </Pressable>
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          {monthLabel(month)}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: true }}
          onPress={withTapSound(() => changeMonth(1))}
          style={styles.monthButton}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.text}
            name="chevron-right"
            size={26}
          />
        </Pressable>
        <View style={styles.navTrailing}>
          {!isCurrentMonth ? (
            <Pressable
              accessibilityLabel="Go to today"
              accessibilityRole="button"
              hitSlop={8}
              onPress={withTapSound(goToToday)}
              style={[styles.todayPill, { backgroundColor: theme.colors.brandSoft }]}
            >
              <Text style={[typography.caption, { color: theme.colors.brand }]}>Today</Text>
            </Pressable>
          ) : null}
          <SyncStatus state={guest ? "pending" : visibleSyncState(sync.status)} />
        </View>
      </View>
      {state.error ? (
        <ErrorState title="Calendar unavailable" message={state.error} onRetry={state.retry} />
      ) : state.loading ? (
        <View accessibilityLabel="Loading calendar" style={styles.padded}>
          <Skeleton height={160} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          <MonthSummary
            budgetLeftMinor={
              budgetView && budgetView.totalLimitMinor > 0 ? budgetView.totalRemainingMinor : null
            }
            expenseMinor={totals.expenseMinor}
            incomeMinor={totals.incomeMinor}
          />
          <CalendarMonthGrid
            days={days}
            month={month}
            occasions={occasions.occasions}
            selectedDate={selectedDate}
            today={todayIso()}
            onSelectDate={setSelectedDate}
          />
          <DayAgenda date={selectedDate} day={selectedDay} occasions={selectedOccasions} />
        </ScrollView>
      )}
      {local.workspace ? (
        <Pressable
          accessibilityHint="Opens the event editor"
          accessibilityLabel="Add event"
          accessibilityRole="button"
          onPress={withTapSound(() => router.push({ pathname: "/(app)/event", params: { date: selectedDate } }))}
          style={[styles.fab, elevation.dialog, { backgroundColor: theme.colors.solid }]}
        >
          <MaterialCommunityIcons color={theme.colors.onSolid} name="plus" size={28} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  padded: { padding: spacing.md },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  monthButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  navTrailing: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  todayPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  list: { paddingBottom: 96 },
  summary: { flexDirection: "row", paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  summaryColumn: { flex: 1, alignItems: "center", gap: 2 },
  summaryAmount: { fontSize: 16, lineHeight: 20 },
  agenda: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xs },
  agendaTitle: { marginBottom: spacing.xxs },
  agendaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  agendaText: { flex: 1, gap: 2 },
  agendaAmount: { fontSize: 15, lineHeight: 20 },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
