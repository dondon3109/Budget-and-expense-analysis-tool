import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import type { SessionStatus } from "@/auth/session-state";
import { useDailyReminderStore, type DailyReminderTime } from "@/stores/daily-reminder-store";

/** Fixed identifier, so rescheduling replaces the one reminder instead of stacking copies. */
export const DAILY_REMINDER_ID = "zoption-daily-reminder";
const DAILY_REMINDER_CHANNEL_ID = "daily-reminder";

/** Where a tap on the reminder lands: the new transaction editor. */
const DAILY_REMINDER_ROUTE = "/(app)/transaction";

export type DailyReminderResult = "scheduled" | "off" | "denied";

// Bumped by every identity change. An apply or restore that started under an
// earlier identity must not write its time back or leave a reminder scheduled.
let identityGeneration = 0;

// The latest launch restore. An apply waits for it, so a restore that is still
// loading the saved time cannot overwrite a time the user just chose.
let restoring: Promise<void> = Promise.resolve();

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
 * "off", and saves the time only once the OS schedule matches it. Asks for
 * notification permission only when turning the reminder on, and turns the
 * reminder off when it is refused.
 *
 * A new time is scheduled under the same identifier, which replaces the old
 * reminder, instead of cancelling first: if a native call throws partway, the
 * previous reminder is still scheduled and still matches the saved time.
 */
export async function applyDailyReminder(time: DailyReminderTime): Promise<DailyReminderResult> {
  await restoring.catch(() => undefined);
  const generation = identityGeneration;
  if (time === "off") {
    await turnOff();
    return "off";
  }

  // Android 13+ only shows the permission prompt once a channel exists.
  await ensureChannel();
  if (!(await hasNotificationPermission())) {
    await turnOff();
    return "denied";
  }
  return (await scheduleIfCurrent(time, generation)) ? "scheduled" : "off";
}

/**
 * Ties the reminder to a signed-in session. Mount once under SessionProvider.
 * Signed in, it restores the reminder; signed out, it clears it. The clear
 * matters at launch: a session that ended while the app was closed resolves
 * straight to signed-out without an identity transition, so
 * clearUserScopedRuntimeState never runs for it.
 */
export function useDailyReminderSession(status: SessionStatus): void {
  useEffect(() => {
    // Best-effort like background sync: a notification failure must never
    // affect startup or sign-in.
    if (status === "signed-in") void startDailyReminder().catch(() => undefined);
    if (status === "signed-out") void clearDailyReminder().catch(() => undefined);
  }, [status]);
}

/**
 * Shows the reminder while the app is open, then loads the saved time and makes
 * the OS schedule match it. Runs when a session is signed in. It never prompts:
 * without permission the saved time is reset to Off. This also repairs drift,
 * such as an iOS reinstall that keeps the saved time in the Keychain but drops
 * the scheduled notification.
 */
export function startDailyReminder(): Promise<void> {
  restoring = restoreDailyReminder();
  return restoring;
}

async function restoreDailyReminder(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: (notification) => {
      const show = notification.request.identifier === DAILY_REMINDER_ID;
      return Promise.resolve({
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: false,
        shouldSetBadge: false,
      });
    },
  });

  const generation = identityGeneration;
  await useDailyReminderStore.persist.rehydrate();
  // An identity change that ran while the saved time loaded wins with its Off.
  const time = generation === identityGeneration ? useDailyReminderStore.getState().time : "off";
  if (time === "off") {
    await turnOff();
    return;
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    await turnOff();
    return;
  }
  await ensureChannel();
  await scheduleIfCurrent(time, generation);
}

/**
 * Turns the reminder off and forgets a tap that has not been handled yet. Runs
 * on every identity change (sign-out, forced sign-out, account switch) so the
 * reminder never outlives the account that set it, and a tap made while signed
 * out cannot open the editor after the next sign-in. The two native calls run
 * independently so a failure in one cannot skip the other; a cancel that still
 * fails is retried by the next restore, which sees Off.
 */
export async function clearDailyReminder(): Promise<void> {
  identityGeneration += 1;
  useDailyReminderStore.getState().setTime("off");
  const results = await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID),
    Promise.resolve().then(() => Notifications.clearLastNotificationResponse()),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
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

async function turnOff(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
  useDailyReminderStore.getState().setTime("off");
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
    name: "Daily reminder",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Schedules `time` and saves it, unless an identity change happened since `generation`. */
async function scheduleIfCurrent(
  time: Exclude<DailyReminderTime, "off">,
  generation: number,
): Promise<boolean> {
  if (generation !== identityGeneration) return false;
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
  // Signed out while the schedule call ran: that cleanup's cancel may have
  // landed first, so cancel again and leave the saved time at its Off.
  if (generation !== identityGeneration) {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
    return false;
  }
  useDailyReminderStore.getState().setTime(time);
  return true;
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
