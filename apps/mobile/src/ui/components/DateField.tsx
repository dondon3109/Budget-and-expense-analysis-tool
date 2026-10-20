import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { calendarMonthWeeks, calendarWeekdays } from "@/features/calendar/calendar-month-grid";
import { monthLabel } from "@/features/calendar/event-form";
import { playSound, withTapSound } from "@/features/sounds/sound-effects";
import { localCalendarDate } from "@/features/transactions/transaction-form";
import { shiftMonthStart } from "@/features/transactions/transaction-list-view";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { BottomSheet } from "./BottomSheet";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateLabel(date: string, weekday?: "long"): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday,
    month: weekday ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface DateFieldProps {
  label: string;
  /** A YYYY-MM-DD date. Anything else shows the placeholder and opens on today's month. */
  value: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (date: string) => void;
}

/** A date input that opens a month calendar instead of asking the user to type the date. */
export function DateField({ label, value, error, hint, disabled, onChange }: DateFieldProps) {
  const theme = useZoptionTheme();
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
  const valid = isoDatePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const today = localCalendarDate();
  const open = visibleMonth !== null;
  const weeks = visibleMonth ? calendarMonthWeeks(visibleMonth) : [];

  function select(date: string) {
    playSound("select");
    onChange(date);
    setVisibleMonth(null);
  }

  return (
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={valid ? `${label}, ${dateLabel(value, "long")}` : label}
        accessibilityHint={error ?? hint ?? "Opens a calendar"}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        onPress={withTapSound(() => setVisibleMonth(`${(valid ? value : today).slice(0, 7)}-01`))}
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            typography.body,
            styles.fieldText,
            { color: valid ? theme.colors.text : theme.colors.textMuted },
          ]}
        >
          {valid ? dateLabel(value) : "Pick a date"}
        </Text>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.textMuted}
          name="calendar-month-outline"
          size={22}
        />
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{hint}</Text>
      ) : null}
      <BottomSheet visible={open} title={label} onDismiss={() => setVisibleMonth(null)}>
        {visibleMonth ? (
          <View style={styles.calendar}>
            <View style={styles.monthRow}>
              <Text
                accessibilityRole="header"
                style={[typography.headline, { color: theme.colors.text }]}
              >
                {monthLabel(visibleMonth)}
              </Text>
              <View style={styles.monthNav}>
                <Pressable
                  accessibilityLabel="Previous month"
                  accessibilityRole="button"
                  onPress={withTapSound(
                    () => setVisibleMonth(shiftMonthStart(visibleMonth, -1)),
                    "select",
                  )}
                  style={styles.navButton}
                >
                  <MaterialCommunityIcons
                    color={theme.colors.brand}
                    name="chevron-left"
                    size={26}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel="Next month"
                  accessibilityRole="button"
                  onPress={withTapSound(
                    () => setVisibleMonth(shiftMonthStart(visibleMonth, 1)),
                    "select",
                  )}
                  style={styles.navButton}
                >
                  <MaterialCommunityIcons
                    color={theme.colors.brand}
                    name="chevron-right"
                    size={26}
                  />
                </Pressable>
              </View>
            </View>
            <View accessibilityElementsHidden style={styles.week}>
              {calendarWeekdays.map((weekday) => (
                <Text
                  key={weekday}
                  style={[typography.caption, styles.weekday, { color: theme.colors.textMuted }]}
                >
                  {weekday.toUpperCase()}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week[0]} style={styles.week}>
                {week.map((date) => {
                  // Days borrowed from the neighbouring months only fill out the week.
                  if (date.slice(0, 7) !== visibleMonth.slice(0, 7)) {
                    return <View key={date} style={styles.day} />;
                  }
                  const selected = valid && date === value;
                  const isToday = date === today;
                  return (
                    <Pressable
                      key={date}
                      accessibilityLabel={`${dateLabel(date, "long")}${isToday ? ", today" : ""}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => select(date)}
                      style={styles.day}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isToday && !selected && { borderColor: theme.colors.brand },
                          selected && { backgroundColor: theme.colors.brand },
                        ]}
                      >
                        <Text
                          style={[
                            typography.body,
                            {
                              color: selected
                                ? theme.colors.onBrand
                                : isToday
                                  ? theme.colors.brand
                                  : theme.colors.text,
                              fontWeight: selected || isToday ? "700" : "400",
                            },
                          ]}
                        >
                          {Number(date.slice(-2))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => select(today)}
              style={[styles.todayButton, { borderColor: theme.colors.border }]}
            >
              <Text style={[typography.label, { color: theme.colors.brand }]}>Today</Text>
            </Pressable>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  fieldText: { flex: 1 },
  calendar: { gap: spacing.xs },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthNav: { flexDirection: "row" },
  navButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  week: { flexDirection: "row" },
  weekday: { width: "14.285714%", textAlign: "center" },
  day: {
    width: "14.285714%",
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  todayButton: {
    alignSelf: "flex-start",
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.round,
    marginTop: spacing.xs,
  },
});
