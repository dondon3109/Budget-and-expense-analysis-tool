import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { currencies } from "@zoption/shared";
import { calendarMonthWeeks, calendarWeekdays } from "@/features/calendar/calendar-month-grid";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import {
  compactAmountLabel,
  type TransactionDateGroup,
  type TransactionTotals,
} from "./transaction-list-view";
import { withTapSound } from "@/features/sounds/sound-effects";

interface TransactionCalendarGridProps {
  month: string;
  selectedDate: string;
  today: string;
  groups: readonly TransactionDateGroup[];
  onSelectDate: (date: string) => void;
}

/** A cell has no room for several currencies, so mixed-currency days show a marker instead. */
function cellTotals(group: TransactionDateGroup | undefined): TransactionTotals | "mixed" | null {
  if (!group) return null;
  const populated = currencies.filter((currency) => group.totals[currency] !== undefined);
  if (populated.length > 1) return "mixed";
  return populated[0] ? (group.totals[populated[0]] ?? null) : null;
}

/** Dense month grid with per-day income and expenses; the day's rows render below it. */
export function TransactionCalendarGrid({
  month,
  selectedDate,
  today,
  groups,
  onSelectDate,
}: TransactionCalendarGridProps) {
  const theme = useZoptionTheme();
  // Days of the neighbouring months only complete the weeks; they stay empty cells here.
  const cells = useMemo(
    () =>
      calendarMonthWeeks(month)
        .flat()
        .map((date) => (date.slice(0, 7) === month.slice(0, 7) ? date : null)),
    [month],
  );
  const byDate = useMemo(() => new Map(groups.map((group) => [group.date, group])), [groups]);

  return (
    <View accessibilityLabel={`Calendar for ${month}`}>
      <View accessibilityElementsHidden style={styles.row}>
        {calendarWeekdays.map((weekday) => (
          <Text
            key={weekday}
            style={[typography.caption, styles.weekday, { color: theme.colors.textMuted }]}
          >
            {weekday}
          </Text>
        ))}
      </View>
      <View style={[styles.row, styles.wrap, { borderColor: theme.colors.border }]}>
        {cells.map((date, index) => {
          const frame = [styles.cell, { borderColor: theme.colors.border }];
          if (date === null) return <View key={`empty-${index}`} style={frame} />;

          const totals = cellTotals(byDate.get(date));
          const selected = date === selectedDate;
          const label = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          });
          return (
            <Pressable
              key={date}
              accessibilityLabel={`${label}${totals ? ", has transactions" : ""}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={withTapSound(() => onSelectDate(date))}
              style={[
                ...frame,
                {
                  backgroundColor: selected
                    ? theme.colors.brandSoft
                    : date === today
                      ? theme.colors.surface
                      : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.day,
                  { color: date === today ? theme.colors.brand : theme.colors.text },
                ]}
              >
                {Number(date.slice(-2))}
              </Text>
              {totals === "mixed" ? (
                <Text style={[styles.amount, { color: theme.colors.textMuted }]}>•••</Text>
              ) : totals ? (
                <>
                  {totals.incomeMinor > 0 ? (
                    <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.income }]}>
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
                </>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  wrap: { flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth },
  weekday: { width: "14.285714%", textAlign: "center", paddingVertical: spacing.xxs },
  cell: {
    width: "14.285714%",
    minHeight: 56,
    paddingHorizontal: 3,
    paddingTop: 3,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  day: { fontSize: 12, lineHeight: 16 },
  amount: { fontSize: 10, lineHeight: 13, textAlign: "right", fontVariant: ["tabular-nums"] },
});
