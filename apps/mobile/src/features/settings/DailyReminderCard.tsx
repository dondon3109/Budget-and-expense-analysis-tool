import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { applyDailyReminder, dailyReminderLabel } from "@/features/reminders/daily-reminder";
import {
  DAILY_REMINDER_TIMES,
  useDailyReminderStore,
  type DailyReminderTime,
} from "@/stores/daily-reminder-store";
import { Button, CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

type Notice = "blocked" | "failed";

/** Picks the time of the once-a-day reminder to log expenses and income, or turns it off. */
export function DailyReminderCard() {
  const theme = useZoptionTheme();
  const time = useDailyReminderStore((state) => state.time);
  // Until the saved time has loaded, "Off" could be wrong, so say nothing yet.
  const restored = useDailyReminderStore((state) => state.restored);
  const [pending, setPending] = useState<DailyReminderTime | null>(null);
  const busy = pending !== null || !restored;
  const [notice, setNotice] = useState<Notice | null>(null);

  // applyDailyReminder saves the time itself once the OS schedule matches it,
  // so the summary above always reflects what is actually scheduled.
  const choose = async (next: DailyReminderTime) => {
    if (busy) return;
    setPending(next);
    setNotice(null);
    try {
      const result = await applyDailyReminder(next);
      if (result === "denied") setNotice("blocked");
    } catch {
      setNotice("failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <CollapsibleCard
      title="Daily reminder"
      summary={restored ? dailyReminderLabel(time) : "Loading…"}
      icon="bell-outline"
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Get one notification a day to record that day&apos;s expenses and income.
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Daily reminder time"
        className="gap-2"
      >
        {DAILY_REMINDER_TIMES.map((option) => {
          const selected = time === option;
          const label = dailyReminderLabel(option);
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected, disabled: busy }}
              disabled={busy}
              onPress={() => void choose(option)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <Text style={[typography.headline, { color: theme.colors.text }]}>{label}</Text>
              <View
                accessibilityElementsHidden
                style={[
                  styles.radio,
                  { borderColor: selected ? theme.colors.brand : theme.colors.border },
                  selected ? { backgroundColor: theme.colors.brand } : null,
                ]}
              >
                {selected ? (
                  <MaterialCommunityIcons name="check" size={12} color={theme.colors.onBrand} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {notice === "blocked" ? (
        <View className="gap-2">
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            Notifications are turned off for Zoption. Allow them in your device settings, then
            choose a time again.
          </Text>
          <Button variant="secondary" size="compact" onPress={() => void Linking.openSettings()}>
            Open settings
          </Button>
        </View>
      ) : null}
      {notice === "failed" ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          Zoption couldn&apos;t update the reminder. Try again.
        </Text>
      ) : null}
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.round,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
});
