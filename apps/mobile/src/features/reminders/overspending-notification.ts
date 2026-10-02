import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Platform } from "react-native";

import {
  getDaysLeftInWeek,
  overspendingAlertMessage,
  type OverspendingAlert,
} from "@zoption/shared";

/** One fixed identifier, so a newer alert replaces the older one in the tray instead of stacking. */
export const OVERSPENDING_NOTIFICATION_ID = "zoption-overspending-alert";
const OVERSPENDING_CHANNEL_ID = "spending-alerts";
/** The key of the condition last announced, so a condition is announced once, across restarts. */
const LAST_NOTIFIED_STORAGE_KEY = "zoption-mobile-overspending-alert-v1";

export function isOverspendingNotification(identifier: string | undefined): boolean {
  return identifier === OVERSPENDING_NOTIFICATION_ID;
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The condition an alert stands for: a spent-out week is keyed by its Monday and a deficit by
 * the date the balance goes below zero, so each is announced once and a new week or a new
 * deficit date is announced again.
 */
export function overspendingAlertKey(alert: OverspendingAlert, today: Date): string {
  if (alert.kind === "deficit_risk") return `deficit:${alert.deficitDate}`;
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (7 - getDaysLeftInWeek(today, "monday")),
  );
  return `overspent:${isoDate(monday)}`;
}

// Bumped by every identity change, so an announcement that started under the previous account
// cannot post that account's alert or record it for the next one.
let identityGeneration = 0;
// The key being announced right now, so two renders of the same alert post it once.
let announcing: string | null = null;

/**
 * Posts the alert as a local notification unless this condition was already announced. Never
 * asks for permission: the daily reminder owns that prompt, so this only uses a grant the user
 * already gave, and a missing grant leaves the condition unrecorded for a later grant.
 */
export async function announceOverspending(
  key: string,
  message: { title: string; body: string },
): Promise<void> {
  if (announcing === key) return;
  announcing = key;
  const generation = identityGeneration;
  try {
    if ((await SecureStore.getItemAsync(LAST_NOTIFIED_STORAGE_KEY)) === key) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted || generation !== identityGeneration) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(OVERSPENDING_CHANNEL_ID, {
        name: "Spending alerts",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: OVERSPENDING_NOTIFICATION_ID,
      content: message,
      trigger: Platform.OS === "android" ? { channelId: OVERSPENDING_CHANNEL_ID } : null,
    });
    if (generation !== identityGeneration) return;
    await SecureStore.setItemAsync(LAST_NOTIFIED_STORAGE_KEY, key);
  } finally {
    if (announcing === key) announcing = null;
  }
}

/**
 * Announces the current overspending alert. Mounted with the safe-to-spend figure, so it runs
 * whenever local data changes it: after a new expense, a sync, or a renewal edit.
 */
export function useOverspendingNotification(alert: OverspendingAlert | null): void {
  const key = alert ? overspendingAlertKey(alert, new Date()) : null;
  const message = alert ? overspendingAlertMessage(alert) : null;
  const title = message?.title ?? null;
  const body = message?.body ?? null;
  useEffect(() => {
    if (!key || !title || !body) return;
    // Best-effort like the daily reminder: a notification failure must never affect the screen.
    void announceOverspending(key, { title, body }).catch(() => undefined);
  }, [key, title, body]);
}

/**
 * Forgets what was announced and removes a posted alert. Runs on every identity change, so
 * one account's financial state never shows in the tray or suppresses the next account's alert.
 */
export async function clearOverspendingNotification(): Promise<void> {
  identityGeneration += 1;
  announcing = null;
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync(LAST_NOTIFIED_STORAGE_KEY),
    Notifications.dismissNotificationAsync(OVERSPENDING_NOTIFICATION_ID),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}
