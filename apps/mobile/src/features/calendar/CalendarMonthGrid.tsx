import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LocalCalendarDay } from "@/db/repository";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { calendarMonthCells, calendarWeekdays } from "./calendar-month-grid";

interface CalendarMonthGridProps {
  month: string;
  selectedDate: string;
  today: string;
  days: ReadonlyMap<string, LocalCalendarDay>;
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
  selected: boolean,
  today: boolean,
): string {
  const parts = [calendarDateLabel(date)];
  if (today) parts.push("today");
  if (selected) parts.push("selected");
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

/** Renders every day in a month and keeps activity details in the agenda below. */
export function CalendarMonthGrid({
  month,
  selectedDate,
  today,
  days,
  onSelectDate,
}: CalendarMonthGridProps) {
  const theme = useZoptionTheme();
  const cells = useMemo(() => calendarMonthCells(month), [month]);

  return (
    <View accessibilityLabel={`Calendar for ${month}`} style={styles.container}>
      <View accessibilityElementsHidden style={styles.weekdays}>
        {calendarWeekdays.map((weekday) => (
          <Text
            key={weekday}
            style={[typography.caption, styles.weekday, { color: theme.colors.textMuted }]}
          >
            {weekday}
          </Text>
        ))}
      </View>
      <View style={styles.days}>
        {cells.map((date, index) => {
          if (date === null) return <View key={`empty-${index}`} style={styles.dayCell} />;

          const day = days.get(date);
          const selected = date === selectedDate;
          const isToday = date === today;
          return (
            <View key={date} style={styles.dayCell}>
              <Pressable
                accessibilityHint="Shows this day's agenda below the calendar"
                accessibilityLabel={dayAccessibilityLabel(date, day, selected, isToday)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
                onPress={() => onSelectDate(date)}
                style={({ pressed }) => [
                  styles.dayButton,
                  {
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                    borderColor: selected || isToday ? theme.colors.brand : theme.colors.border,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text style={[typography.callout, { color: theme.colors.text }]}>
                  {Number(date.slice(-2))}
                </Text>
                <View accessibilityElementsHidden style={styles.indicators}>
                  {day?.events.length ? (
                    <View style={[styles.indicator, { backgroundColor: theme.colors.brand }]} />
                  ) : null}
                  {day?.subscriptionBills.length ? (
                    <View style={[styles.indicator, { backgroundColor: theme.colors.warning }]} />
                  ) : null}
                  {day?.transactions.length ? (
                    <View style={[styles.indicator, { backgroundColor: theme.colors.info }]} />
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  weekdays: { flexDirection: "row" },
  weekday: { width: "14.285714%", textAlign: "center" },
  days: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.285714%", padding: 2 },
  dayButton: {
    minHeight: touchTarget,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xxs,
  },
  indicators: { minHeight: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  indicator: { width: 6, height: 6, borderRadius: radii.round },
});
