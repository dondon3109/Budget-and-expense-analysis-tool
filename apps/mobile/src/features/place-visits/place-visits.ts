import { placeKinds } from "@zoption/shared";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { z } from "zod";

import type { SessionStatus } from "@/auth/session-state";

import { categoryHintFor, PLACE_VISIT_NOTIFICATION_PREFIX } from "./visit-rules";
import {
  clearVisitState,
  loadVisitState,
  MAX_EXCLUDED_PLACES,
  saveVisitState,
} from "./visit-storage";

/**
 * "Did you spend here?" prompts. Android only for now: a foreground-service
 * location task tracks where the device rests, and after it leaves a stay long
 * enough to be a visit, the Worker names the place and a local notification
 * offers a prefilled expense.
 */

export const PLACE_VISIT_TASK_NAME = "zoption-place-visits";
export const PLACE_VISIT_CHANNEL_ID = "place-visits";
export const PLACE_VISIT_CATEGORY_ID = "place-visit";
const ACTION_ADD = "add-expense";
const ACTION_EXCLUDE = "never-here";

export const placeVisitsSupported = Platform.OS === "android";

export type EnableResult =
  "enabled" | "notifications-denied" | "location-denied" | "background-denied";

const visitNotificationDataSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(placeKinds),
  latitude: z.number(),
  longitude: z.number(),
});

export type VisitNotificationData = z.infer<typeof visitNotificationDataSchema>;

let handledTap: string | null = null;

export async function isPlaceVisitsEnabled(): Promise<boolean> {
  if (!placeVisitsSupported) return false;
  return Location.hasStartedLocationUpdatesAsync(PLACE_VISIT_TASK_NAME);
}

/**
 * Asks for notification, foreground, then background location permission and
 * starts the task. Call only after the user accepted the in-app disclosure:
 * Google Play requires it before the background location prompt.
 */
export async function enablePlaceVisits(): Promise<EnableResult> {
  await Notifications.setNotificationChannelAsync(PLACE_VISIT_CHANNEL_ID, {
    name: "Place visit prompts",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const notifications = await Notifications.getPermissionsAsync();
  if (!notifications.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return "notifications-denied";
  }
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return "location-denied";
  // Android 11+ sends the user to system settings to choose "Allow all the time".
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return "background-denied";

  await Notifications.setNotificationCategoryAsync(PLACE_VISIT_CATEGORY_ID, [
    { identifier: ACTION_ADD, buttonTitle: "Add expense", options: { opensAppToForeground: true } },
    {
      identifier: ACTION_EXCLUDE,
      buttonTitle: "Don't ask here",
      options: { opensAppToForeground: true },
    },
  ]);
  await Location.startLocationUpdatesAsync(PLACE_VISIT_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    // Movement-driven: a resting device sends nothing, which is what makes a
    // stay's length measurable (see advanceStay).
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Zoption place prompts are on",
      notificationBody: "After you leave a store or restaurant, Zoption asks if you spent money.",
      killServiceOnDestroy: false,
    },
  });
  return "enabled";
}

/** Stops the task and forgets the stay in progress. Exclusions are kept. */
export async function disablePlaceVisits(): Promise<void> {
  await stopPlaceVisits();
  const state = await loadVisitState();
  await saveVisitState({ ...state, stay: null });
}

export async function stopPlaceVisits(): Promise<void> {
  if (!placeVisitsSupported) return;
  if (await Location.hasStartedLocationUpdatesAsync(PLACE_VISIT_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(PLACE_VISIT_TASK_NAME);
  }
}

/**
 * Stops prompts and deletes every saved place, exclusions included. Runs on
 * each identity change so one account's places never reach the next.
 */
export async function clearPlaceVisits(): Promise<void> {
  if (!placeVisitsSupported) return;
  const results = await Promise.allSettled([stopPlaceVisits(), clearVisitState()]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** Clears prompts once the session resolves signed out, including at launch. */
export function usePlaceVisitSession(status: SessionStatus): void {
  useEffect(() => {
    if (status === "signed-out") void clearPlaceVisits().catch(() => undefined);
  }, [status]);
}

export async function excludePlace(place: {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const state = await loadVisitState();
  const others = state.excluded.filter((excluded) => excluded.id !== place.id);
  // Newest first; the oldest exclusion falls off past the cap.
  const excluded = [place, ...others].slice(0, MAX_EXCLUDED_PLACES);
  await saveVisitState({ ...state, excluded });
}

export async function removeExcludedPlace(id: string): Promise<void> {
  const state = await loadVisitState();
  await saveVisitState({ ...state, excluded: state.excluded.filter((place) => place.id !== id) });
}

/**
 * Handles a tap on a visit prompt, including one that cold-starts the app:
 * "Add expense" (or the body) opens a prefilled expense, "Don't ask here"
 * excludes the place. Render after the authenticated Stack, like the daily
 * reminder's handler.
 */
export function PlaceVisitTapHandler() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    if (!navigationReady) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      const request = response?.notification.request;
      if (!response || !request?.identifier.startsWith(PLACE_VISIT_NOTIFICATION_PREFIX)) return;
      const tap = `${response.notification.date}:${response.actionIdentifier}`;
      if (tap === handledTap) return;
      handledTap = tap;
      Notifications.clearLastNotificationResponse();
      void Notifications.dismissNotificationAsync(request.identifier).catch(() => undefined);
      const parsed = visitNotificationDataSchema.safeParse(request.content.data);
      if (!parsed.success) return;
      const data = parsed.data;
      if (response.actionIdentifier === ACTION_EXCLUDE) {
        void excludePlace({
          id: data.placeId,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
        }).catch(() => undefined);
        return;
      }
      router.push({
        pathname: "/(app)/transaction",
        params: { kind: "expense", description: data.name, category: categoryHintFor(data.kind) },
      });
    };
    handle(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [navigationReady]);
  return null;
}
