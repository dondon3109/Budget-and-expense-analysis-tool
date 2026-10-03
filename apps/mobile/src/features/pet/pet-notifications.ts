import * as Notifications from "expo-notifications";
import type { Href } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { PET_DEAD_AFTER_HOURS, type PetView } from "@zoption/shared";

import { usePetStore } from "@/stores/pet-store";

import { petSpeciesLabels } from "./pet-labels";

const HOUR_MS = 60 * 60 * 1000;
// Pet days follow Manila time on the Worker, so the egg reminder and quiet hours do too.
const MANILA_OFFSET_MS = 8 * HOUR_MS;
const QUIET_FROM_HOUR = 22;
const QUIET_UNTIL_HOUR = 7;
const PET_CHANNEL_ID = "pet-alerts";
export const PET_NOTIFICATION_ROUTE: Href = "/(app)/pet";

/** Warnings for a hatched pet, by hours since its last activity. The last one is its death. */
const HEALTH_ALERTS = [
  { id: "zoption-pet-sleepy", hours: 20 },
  { id: "zoption-pet-sick", hours: 24 },
  { id: "zoption-pet-weaker", hours: 36 },
  { id: "zoption-pet-fading", hours: 48 },
  { id: "zoption-pet-12h", hours: 60 },
  { id: "zoption-pet-final", hours: 70 },
  { id: "zoption-pet-died", hours: PET_DEAD_AFTER_HOURS },
] as const;
const EGG_REMINDER_ID = "zoption-pet-egg";
const EGG_RESET_ID = "zoption-pet-egg-reset";
/** Every pet identifier, so a reschedule or clear cancels all of them. */
const PET_NOTIFICATION_IDS: readonly string[] = [
  ...HEALTH_ALERTS.map((alert) => alert.id),
  EGG_REMINDER_ID,
  EGG_RESET_ID,
];

export function isPetNotification(identifier: string | undefined): boolean {
  return identifier !== undefined && PET_NOTIFICATION_IDS.includes(identifier);
}

export interface PetNotification {
  id: string;
  at: number;
  title: string;
  body: string;
}

/** The instant of a Manila wall-clock time, `days` after the Manila day of `at`. */
function manilaTime(at: number, days: number, hour: number, minute = 0): number {
  const local = new Date(at + MANILA_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour, minute) -
    MANILA_OFFSET_MS
  );
}

/** Moves an alert due between 22:00 and 07:00 to 07:30 the next morning. */
export function outsideQuietHours(at: number): number {
  const hour = new Date(at + MANILA_OFFSET_MS).getUTCHours();
  if (hour >= QUIET_FROM_HOUR) return manilaTime(at, 1, QUIET_UNTIL_HOUR, 30);
  if (hour < QUIET_UNTIL_HOUR) return manilaTime(at, 0, QUIET_UNTIL_HOUR, 30);
  return at;
}

function healthAlertText(id: (typeof HEALTH_ALERTS)[number]["id"], name: string) {
  switch (id) {
    case "zoption-pet-sleepy":
      return {
        title: `Your ${name} is getting sleepy`,
        body: "Log something today to keep it healthy.",
      };
    case "zoption-pet-sick":
      return {
        title: `Your ${name} is sick`,
        body: "A day without you made it ill. Log a transaction to heal it.",
      };
    case "zoption-pet-weaker":
      return {
        title: `Your ${name} is getting weaker`,
        body: "Its health is dropping. Any activity in Zoption heals it.",
      };
    case "zoption-pet-fading":
      return {
        title: `Your ${name} is fading`,
        body: "It has 24 hours left. Open Zoption and log something to save it.",
      };
    case "zoption-pet-12h":
      return {
        title: `12 hours left for your ${name}`,
        body: "It is fading fast. One transaction brings it back.",
      };
    case "zoption-pet-final":
      return {
        title: `Last chance to save your ${name}`,
        body: "It passes away in 2 hours unless you log something.",
      };
    case "zoption-pet-died":
      return {
        title: `Your ${name} passed away`,
        body: "A new egg is waiting. Pick one to start again.",
      };
  }
}

/**
 * The alerts to schedule for a pet view. A hatched pet gets the health warnings still ahead of
 * it, and a warning that quiet hours would push past its death is dropped. An egg with a streak
 * gets a reminder at 20:00 the next day, and a note the morning after that if the streak broke.
 * A pet that is off, unchosen, or gone gets none.
 */
export function petNotificationPlan(view: PetView, now: number): PetNotification[] {
  if (!view.enabled || view.species === null) return [];
  const name = petSpeciesLabels[view.species].toLowerCase();

  if (view.stage === "egg") {
    if (view.eggStreakDays === 0) return [];
    return [
      {
        id: EGG_REMINDER_ID,
        at: manilaTime(now, 1, 20),
        title: `Your ${name} egg misses you`,
        body: `Open Zoption today to keep its ${view.eggStreakDays}-day streak.`,
      },
      {
        id: EGG_RESET_ID,
        at: manilaTime(now, 2, 7, 30),
        title: `Your ${name} egg's streak started over`,
        body: "Open Zoption each day for a week to hatch it.",
      },
    ];
  }

  if (view.lastActivityAt === null) return [];
  const lastActivity = Date.parse(view.lastActivityAt);
  const diesAt = lastActivity + PET_DEAD_AFTER_HOURS * HOUR_MS;
  return HEALTH_ALERTS.flatMap((alert) => {
    const at = outsideQuietHours(lastActivity + alert.hours * HOUR_MS);
    if (at <= now) return [];
    if (alert.hours < PET_DEAD_AFTER_HOURS && at >= diesAt) return [];
    return [{ id: alert.id, at, ...healthAlertText(alert.id, name) }];
  });
}

// Bumped by every identity change, so a reschedule that started under the previous account
// cannot leave that account's pet alerts behind.
let identityGeneration = 0;
// Reschedules run one after another, so an older plan can never land after a newer one.
let queue: Promise<void> = Promise.resolve();

async function cancelAll(): Promise<void> {
  await Promise.allSettled(
    PET_NOTIFICATION_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
  );
}

/**
 * Replaces the scheduled pet alerts with `plan`. Never asks for permission: the daily reminder
 * owns that prompt, so pet alerts only use a grant the user already gave.
 */
export function schedulePetNotifications(plan: readonly PetNotification[]): Promise<void> {
  const generation = identityGeneration;
  queue = queue
    .then(async () => {
      await cancelAll();
      if (plan.length === 0) return;
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted || generation !== identityGeneration) return;
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(PET_CHANNEL_ID, {
          name: "Pet alerts",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      for (const notification of plan) {
        if (generation !== identityGeneration) return;
        await Notifications.scheduleNotificationAsync({
          identifier: notification.id,
          content: { title: notification.title, body: notification.body },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notification.at,
            channelId: PET_CHANNEL_ID,
          },
        });
      }
    })
    // Best-effort like the other local notifications: a failure must never affect the app.
    .catch(() => undefined);
  return queue;
}

/**
 * Keeps the pet alerts in step with the last pet view, which changes on every check-in. With
 * no view (offline, or before the first answer) the schedule from the last view stays.
 */
export function usePetNotifications(): void {
  const pet = usePetStore((state) => state.pet);
  const plan = pet ? petNotificationPlan(pet, Date.now()) : null;
  const planKey = plan ? JSON.stringify(plan) : null;
  useEffect(() => {
    if (planKey === null) return;
    void schedulePetNotifications(JSON.parse(planKey) as PetNotification[]);
  }, [planKey]);
}

/** Cancels every pet alert. Runs on each identity change, so no alert outlives its account. */
export function clearPetNotifications(): Promise<void> {
  identityGeneration += 1;
  queue = queue.then(cancelAll);
  return queue;
}
