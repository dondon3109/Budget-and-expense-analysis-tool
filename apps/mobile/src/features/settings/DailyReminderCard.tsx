import { useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";

import { applyDailyReminder } from "@/features/reminders/daily-reminder";
import {
  useDailyReminderRestoredStore,
  useDailyReminderStore,
} from "@/stores/daily-reminder-store";
import { Button, CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

type Notice = "blocked" | "failed";

/** Turns the twice-daily (12:00 PM and 9:00 PM) reminder to log expenses and income on or off. */
export function DailyReminderCard() {
  const theme = useZoptionTheme();
  const enabled = useDailyReminderStore((state) => state.enabled);
  // Until the saved choice has loaded, "Off" could be wrong, so say nothing yet.
  const restored = useDailyReminderRestoredStore((state) => state.restored);
  const [pending, setPending] = useState(false);
  const busy = pending || !restored;
  const [notice, setNotice] = useState<Notice | null>(null);

  // applyDailyReminder saves the choice itself once the OS schedule matches it,
  // so the summary above always reflects what is actually scheduled.
  const toggle = async (next: boolean) => {
    if (busy) return;
    setPending(true);
    setNotice(null);
    try {
      const result = await applyDailyReminder(next);
      if (result === "denied") setNotice("blocked");
    } catch {
      setNotice("failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <CollapsibleCard
      title="Daily reminder"
      summary={restored ? (enabled ? "On" : "Off") : "Loading…"}
      icon="bell-outline"
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Get a notification at 12:00 PM and 9:00 PM to record the day&apos;s expenses and income.
      </Text>
      <View style={styles.option}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Remind me daily</Text>
        <Switch
          accessibilityLabel="Remind me daily"
          disabled={busy}
          value={enabled}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        />
      </View>
      {notice === "blocked" ? (
        <View className="gap-2">
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            Notifications are turned off for Zoption. Allow them in your device settings, then turn
            the reminder on again.
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
    gap: spacing.sm,
  },
});
