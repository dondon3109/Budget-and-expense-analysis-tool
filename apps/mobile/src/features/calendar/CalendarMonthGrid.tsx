import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LocalBudgetOccasion, LocalCalendarDay } from "@/db/view-models";
import { radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { compactAmountLabel } from "../transactions/transaction-list-view";
import { dayTotals } from "./calendar-day-summary";
import { calendarMonthWeeks, calendarWeekdays } from "./calendar-month-grid";

interface CalendarMonthGridProps {
  month: string;
  selectedDate: string;
  today: string;
  days: ReadonlyMap<string, LocalCalendarDay>;
  /** Occasion budgets in the month, marked on their day. */
  occasions: readonly LocalBudgetOccasion[];
  onSelectDate: (date: string) => void;
}

function calendarDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayAccessibilityLabel(
  date: string,
  day: LocalCalendarDay | undefined,
  occasions: readonly LocalBudgetOccasion[],
  selected: boolean,
  today: boolean,
): string {
  const parts = [calendarDateLabel(date)];
  if (today) parts.push("today");
  if (selected) parts.push("selected");
  if (occasions.length) {
    parts.push(`occasion budget ${occasions.map((occasion) => occasion.title).join(", ")}`);
  }
  if (day?.events.length) {
    parts.push(`${day.events.length} event${day.events.length === 1 ? "" : "s"}`);
  }
  if (day?.subscriptionBills.length) {
    parts.push(
      `${day.subscriptionBills.length} bill${day.subscriptionBills.length === 1 ? "" : "s"}`,
    );
  }
  if (day?.transactions.length) {
    parts.push(`${day.transactions.length} transaction${day.transactions.length === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

/**
 * The month as a full-width ruled grid, like a paper calendar. Each cell shows its date, an
 * occasion budget as a tag, and the day's income and spending; the agenda below has the detail.
 * Days from the neighbouring months only complete the first and last week.
 */
export function CalendarMonthGrid({
  month,
  selectedDate,
  today,
  days,
  occasions,
  onSelectDate,
}: CalendarMonthGridProps) {
  const theme = useZoptionTheme();
  const weeks = useMemo(() => calendarMonthWeeks(month), [month]);
  const occasionsByDate = useMemo(() => {
    const byDate = new Map<string, LocalBudgetOccasion[]>();
    for (const occasion of occasions) {
      byDate.set(occasion.date, [...(byDate.get(occasion.date) ?? []), occasion]);
    }
    return byDate;
  }, [occasions]);
  const rule = { borderColor: theme.colors.border };

  return (
    <View accessibilityLabel={`Calendar for ${month}`}>
      <View accessibilityElementsHidden style={[styles.weekdays, rule]}>
        {calendarWeekdays.map((weekday, index) => (
          <Text
            key={weekday}
            style={[
              typography.label,
              styles.weekday,
              {
                color:
                  index === 0
                    ? theme.colors.expense
                    : index === 6
                      ? theme.colors.info
                      : theme.colors.textMuted,
              },
            ]}
          >
            {weekday}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((date, index) => {
            const inMonth = date.slice(0, 7) === month.slice(0, 7);
            const dayNumber = Number(date.slice(-2));
            const numberColor = !inMonth
              ? theme.colors.textMuted
              : index === 0
                ? theme.colors.expense
                : index === 6
                  ? theme.colors.info
                  : theme.colors.text;
            if (!inMonth) {
              return (
                <View key={date} style={[styles.cell, rule, { opacity: 0.45 }]}>
                  <Text style={[typography.callout, styles.number, { color: numberColor }]}>
                    {dayNumber}
                  </Text>
                </View>
              );
            }

            const day = days.get(date);
            const dayOccasions = occasionsByDate.get(date) ?? [];
            const totals = dayTotals(day);
            const selected = date === selectedDate;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                accessibilityHint="Shows this day's agenda below the calendar"
                accessibilityLabel={dayAccessibilityLabel(
                  date,
                  day,
                  dayOccasions,
                  selected,
                  isToday,
                )}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
                onPress={() => onSelectDate(date)}
                style={[styles.cell, rule, selected && { backgroundColor: theme.colors.brandSoft }]}
              >
                <View
                  style={[styles.numberWrap, isToday && { backgroundColor: theme.colors.solid }]}
                >
                  <Text
                    style={[
                      typography.callout,
                      styles.number,
                      { color: isToday ? theme.colors.onSolid : numberColor },
                    ]}
                  >
                    {dayNumber}
                  </Text>
                </View>
                <View accessibilityElementsHidden style={styles.cellBody}>
                  {dayOccasions[0] ? (
                    <View style={[styles.tag, { backgroundColor: theme.colors.brandSoft }]}>
                      <Text
                        numberOfLines={1}
                        style={[styles.tagText, { color: theme.colors.brand }]}
                      >
                        {dayOccasions[0].title}
                      </Text>
                    </View>
                  ) : null}
                  {totals.incomeMinor > 0 ? (
                    <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.info }]}>
                      {compactAmountLabel(totals.incomeMinor)}
                    </Text>
                  ) : null}
                  {totals.expenseMinor > 0 ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.amount, { color: theme.colors.expense }]}
                    >
                      {compactAmountLabel(totals.expenseMinor)}
                    </Text>
                  ) : null}
                  {day?.events.length || day?.subscriptionBills.length ? (
                    <View style={styles.dots}>
                      {day?.events.length ? (
                        <View style={[styles.dot, { backgroundColor: theme.colors.brand }]} />
                      ) : null}
                      {day?.subscriptionBills.length ? (
                        <View style={[styles.dot, { backgroundColor: theme.colors.warning }]} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdays: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
  },
  weekday: { width: "14.285714%", textAlign: "center" },
  week: { flexDirection: "row" },
  cell: {
    width: "14.285714%",
    minHeight: 76,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
    paddingTop: 3,
    gap: 2,
  },
  numberWrap: {
    alignSelf: "flex-start",
    minWidth: 22,
    paddingHorizontal: 4,
    borderRadius: radii.sm,
    alignItems: "center",
  },
  number: { fontWeight: "500" },
  cellBody: { gap: 1 },
  tag: { borderRadius: 3, paddingHorizontal: 2, alignSelf: "stretch" },
  tagText: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
  amount: { fontSize: 10, lineHeight: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dots: { flexDirection: "row", gap: 3, marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: radii.round },
});
