import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import type { SessionStatus } from "@/auth/session-state";
import { isOverspendingNotification } from "@/features/reminders/overspending-notification";
import {
  isWidgetNotification,
  widgetNotificationRoute,
} from "@/features/widget/widget-notifications";
import {
  useDailyReminderRestoredStore,
  useDailyReminderStore,
} from "@/stores/daily-reminder-store";

/** Fixed identifiers, so rescheduling replaces each reminder instead of stacking copies. */
export const DAILY_REMINDERS = [
  { id: "zoption-daily-reminder-noon", hour: 12 },
  { id: "zoption-daily-reminder-night", hour: 21 },
] as const;
const DAILY_REMINDER_CHANNEL_ID = "daily-reminder";

/** Where a tap on the reminder lands: the new transaction editor. */
const DAILY_REMINDER_ROUTE = "/(app)/transaction";

export type DailyReminderResult = "scheduled" | "off" | "denied";

function isDailyReminder(identifier: string | undefined): boolean {
  return DAILY_REMINDERS.some((reminder) => reminder.id === identifier);
}

// Bumped by every identity change. An apply or restore that started under an
// earlier identity must not write its choice back or leave a reminder scheduled.
let identityGeneration = 0;

// The latest launch restore. An apply waits for it, so a restore that is still
// loading the saved time cannot overwrite a choice the user just made.
let restoring: Promise<void> = Promise.resolve();

// The tap last acted on. A launching tap can reach both
// getLastNotificationResponse and the response listener; each tap opens the
// editor once.
let handledTap: string | null = null;

/**
 * Schedules the daily reminders (12:00 PM and 9:00 PM) when `enabled`, or
 * removes them, and saves the choice only once the OS schedule matches it. Asks
 * for notification permission only when turning the reminders on, and turns
 * them off when it is refused.
 *
 * Each reminder is scheduled under its own fixed identifier, which replaces the
 * previous one, instead of cancelling first: if a native call throws partway,
 * the previous reminders are still scheduled and still match the saved choice.
 */
export async function applyDailyReminder(enabled: boolean): Promise<DailyReminderResult> {
  await restoring.catch(() => undefined);
  const generation = identityGeneration;
  if (!enabled) {
    await turnOff();
    return "off";
  }

  // Android 13+ only shows the permission prompt once a channel exists.
  await ensureChannel();
  if (!(await hasNotificationPermission())) {
    await turnOff();
    return "denied";
  }
  return (await scheduleIfCurrent(generation)) ? "scheduled" : "off";
}

/**
 * Ties the reminder to a signed-in or guest session. Mount once under SessionProvider.
 * In either, it restores the reminders; signed out, it clears it. The clear
 * matters at launch: a session that ended while the app was closed resolves
 * straight to signed-out without an identity transition, so
 * clearUserScopedRuntimeState never runs for it.
 */
export function useDailyReminderSession(status: SessionStatus): void {
  useEffect(() => {
    // Best-effort like background sync: a notification failure must never
    // affect startup or sign-in.
    if (status === "signed-in" || status === "guest")
      void startDailyReminder().catch(() => undefined);
    if (status === "signed-out") void clearDailyReminder().catch(() => undefined);
  }, [status]);
}

/**
 * Shows the reminders while the app is open, then loads the saved choice and
 * makes the OS schedule match it. Runs when a session is signed in. Reminders
 * are on by default, so this is where a new install asks for notification
 * permission; a refusal turns them off, so the prompt is not repeated. This
 * also repairs drift, such as an iOS reinstall that keeps the saved choice in
 * the Keychain but drops the scheduled notifications.
 */
export function startDailyReminder(): Promise<void> {
  useDailyReminderRestoredStore.setState({ restored: false });
  // `finally`, not a success path: a failed restore must not leave the card
  // waiting forever. It then shows whatever choice was loaded, if any.
  restoring = restoreDailyReminder().finally(() => {
    useDailyReminderRestoredStore.setState({ restored: true });
  });
  return restoring;
}

async function restoreDailyReminder(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: (notification) => {
      const identifier = notification.request.identifier;
      const show =
        isDailyReminder(identifier) ||
        isWidgetNotification(identifier) ||
        isOverspendingNotification(identifier);
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
  // An identity change that ran while the saved choice loaded wins with its reset.
  if (generation !== identityGeneration || !useDailyReminderStore.getState().enabled) {
    await turnOff();
    return;
  }
  await ensureChannel();
  if (!(await hasNotificationPermission())) {
    await turnOff();
    return;
  }
  await scheduleIfCurrent(generation);
}

/**
 * Cancels the reminders, resets the choice to its default (on) for the next
 * session, and forgets a tap that has not been handled yet. Runs on every
 * identity change (sign-out, forced sign-out, account switch) so the reminders
 * never outlive the account that set them, and a tap made while signed out
 * cannot open the editor after the next sign-in. The native calls run
 * independently so a failure in one cannot skip the others; a cancel that still
 * fails is repaired by the next restore.
 */
export async function clearDailyReminder(): Promise<void> {
  identityGeneration += 1;
  useDailyReminderStore.getState().setEnabled(true);
  const results = await Promise.allSettled([
    ...DAILY_REMINDERS.map(({ id }) => Notifications.cancelScheduledNotificationAsync(id)),
    Promise.resolve().then(() => Notifications.clearLastNotificationResponse()),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * Opens the transaction editor when the user taps the reminder, including the
 * tap that cold-starts the app. Render it after the authenticated Stack. It
 * waits until the root navigator is ready, because a push before that is
 * dropped on a cold start. The last response is cleared so a remount (an
 * app-lock unlock, a workspace reopen) does not open the editor a second time.
 */
export function DailyReminderTapHandler() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    if (!navigationReady) return;
    const openEditor = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier, content } = response.notification.request;
      // A daily reminder opens the editor; a widget review note opens its confirm screen.
      const route = isDailyReminder(identifier)
        ? DAILY_REMINDER_ROUTE
        : widgetNotificationRoute(identifier, content.data);
      if (!route) return;
      const tap = `${response.notification.date}:${response.actionIdentifier}`;
      if (tap === handledTap) return;
      handledTap = tap;
      Notifications.clearLastNotificationResponse();
      router.push(route);
    };
    openEditor(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openEditor);
    return () => subscription.remove();
  }, [navigationReady]);
  return null;
}

async function turnOff(): Promise<void> {
  await Promise.all(
    DAILY_REMINDERS.map(({ id }) => Notifications.cancelScheduledNotificationAsync(id)),
  );
  useDailyReminderStore.getState().setEnabled(false);
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
    name: "Daily reminder",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Schedules both reminders and saves the choice, unless an identity change happened since `generation`. */
async function scheduleIfCurrent(generation: number): Promise<boolean> {
  if (generation !== identityGeneration) return false;
  for (const { id, hour } of DAILY_REMINDERS) {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: "Log today's money",
        body: "Take a minute to record today's expenses and income.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
        channelId: DAILY_REMINDER_CHANNEL_ID,
      },
    });
  }
  // Signed out while the schedule calls ran: that cleanup's cancel may have
  // landed first, so cancel again and leave the choice at its reset.
  if (generation !== identityGeneration) {
    await Promise.all(
      DAILY_REMINDERS.map(({ id }) => Notifications.cancelScheduledNotificationAsync(id)),
    );
    return false;
  }
  useDailyReminderStore.getState().setEnabled(true);
  return true;
}

async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}
