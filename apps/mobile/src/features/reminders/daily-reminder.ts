import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import type { DailyReminderTime } from "@/stores/daily-reminder-store";

/** Fixed identifier, so rescheduling replaces the one reminder instead of stacking copies. */
export const DAILY_REMINDER_ID = "zoption-daily-reminder";
const DAILY_REMINDER_CHANNEL_ID = "daily-reminder";

/** Where a tap on the reminder lands: the new transaction editor. */
const DAILY_REMINDER_ROUTE = "/(app)/transaction";

export type DailyReminderResult = "scheduled" | "off" | "denied";

/** "18:00" → "6:00 PM"; "off" → "Off". */
export function dailyReminderLabel(time: DailyReminderTime): string {
  if (time === "off") return "Off";
  const [hour, minute] = parseTime(time);
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * Replaces the scheduled daily reminder with one at `time`, or removes it for
 * "off". Asks for notification permission only when turning the reminder on,
 * and schedules nothing when it is refused.
 */
export async function applyDailyReminder(time: DailyReminderTime): Promise<DailyReminderResult> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
  if (time === "off") return "off";

  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
      name: "Daily reminder",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  if (!(await hasNotificationPermission())) return "denied";

  const [hour, minute] = parseTime(time);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: "Log today's money",
      body: "Take a minute to record today's expenses and income.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: DAILY_REMINDER_CHANNEL_ID,
    },
  });
  return "scheduled";
}

/**
 * Opens the transaction editor when the user taps the reminder, including the
 * tap that cold-starts the app. Render it after the authenticated Stack so
 * the route exists; the last response is cleared so a remount (an app-lock
 * unlock, a workspace reopen) does not open the editor a second time.
 */
export function DailyReminderTapHandler() {
  useEffect(() => {
    const openEditor = (response: Notifications.NotificationResponse | null) => {
      if (response?.notification.request.identifier !== DAILY_REMINDER_ID) return;
      Notifications.clearLastNotificationResponse();
      router.push(DAILY_REMINDER_ROUTE);
    };
    openEditor(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openEditor);
    return () => subscription.remove();
  }, []);
  return null;
}

async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function parseTime(time: Exclude<DailyReminderTime, "off">): [number, number] {
  const [hour, minute] = time.split(":");
  return [Number(hour), Number(minute)];
}
