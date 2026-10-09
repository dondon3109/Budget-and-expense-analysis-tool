import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { compactAmountLabel } from "../transactions/transaction-list-view";
import { calendarMonthWeeks, calendarWeekdays, type CalendarCell } from "./calendar-month-grid";

interface CalendarMonthGridProps {
  month: string;
  selectedDate: string;
  today: string;
  cells: ReadonlyMap<string, CalendarCell>;
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
  cell: CalendarCell | undefined,
  selected: boolean,
  today: boolean,
): string {
  const parts = [calendarDateLabel(date)];
  if (today) parts.push("today");
  if (selected) parts.push("selected");
  parts.push(...(cell?.summary ?? []));
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
  cells,
  onSelectDate,
}: CalendarMonthGridProps) {
  const theme = useZoptionTheme();
  const weeks = useMemo(() => calendarMonthWeeks(month), [month]);
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

            const cell = cells.get(date);
            const selected = date === selectedDate;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                accessibilityHint="Shows this day's agenda below the calendar"
                accessibilityLabel={dayAccessibilityLabel(date, cell, selected, isToday)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
                onPress={withTapSound(() => onSelectDate(date))}
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
                  {cell?.tag ? (
                    <View style={[styles.tag, { backgroundColor: theme.colors.brandSoft }]}>
                      <Text
                        numberOfLines={1}
                        style={[styles.tagText, { color: theme.colors.brand }]}
                      >
                        {cell.tag}
                      </Text>
                    </View>
                  ) : null}
                  {cell?.mixedCurrency ? (
                    <Text style={[styles.amount, { color: theme.colors.textMuted }]}>•••</Text>
                  ) : (
                    <>
                      {cell && cell.incomeMinor > 0 ? (
                        <Text
                          numberOfLines={1}
                          style={[styles.amount, { color: theme.colors.info }]}
                        >
                          {compactAmountLabel(cell.incomeMinor)}
                        </Text>
                      ) : null}
                      {cell && cell.expenseMinor > 0 ? (
                        <Text
                          numberOfLines={1}
                          style={[styles.amount, { color: theme.colors.expense }]}
                        >
                          {compactAmountLabel(cell.expenseMinor)}
                        </Text>
                      ) : null}
                    </>
                  )}
                  {cell?.hasEvent || cell?.hasBill ? (
                    <View style={styles.dots}>
                      {cell.hasEvent ? (
                        <View style={[styles.dot, { backgroundColor: theme.colors.brand }]} />
                      ) : null}
                      {cell.hasBill ? (
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
