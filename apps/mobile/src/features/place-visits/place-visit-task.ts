import type * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { lookupNearbyPlace } from "@/api/places";
import { supabase } from "@/auth/supabase-client";

import {
  PLACE_VISIT_CATEGORY_ID,
  PLACE_VISIT_CHANNEL_ID,
  PLACE_VISIT_TASK_NAME,
  stopPlaceVisits,
  type VisitNotificationData,
} from "./place-visits";
import {
  advanceStay,
  PLACE_VISIT_NOTIFICATION_PREFIX,
  pruneCooldowns,
  shouldLookUp,
  type LocationFix,
} from "./visit-rules";
import { loadVisitState, saveVisitState, type VisitState } from "./visit-storage";

/**
 * The headless location task behind place visit prompts. app/_layout.tsx
 * imports this module for its side effect only, so it runs eagerly despite
 * inlineRequires and the task exists before the OS delivers fixes.
 */

// Fix batches can arrive while the previous one is still waiting on the
// Worker; each must see the state the last one saved.
let queue: Promise<void> = Promise.resolve();

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  PLACE_VISIT_TASK_NAME,
  async ({ data, error }) => {
    if (error || !data) return;
    const fixes = data.locations.map((location): LocationFix => ({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    }));
    queue = queue.then(() => handleFixes(fixes)).catch(() => undefined);
    await queue;
  },
);

async function handleFixes(fixes: LocationFix[]): Promise<void> {
  const state = await loadVisitState();
  const { stay, finished } = advanceStay(state.stay, fixes);
  const now = Date.now();
  const next: VisitState = { ...state, stay, prompted: pruneCooldowns(state.prompted, now) };
  await saveVisitState(next);

  // Only the latest finished stay: an older one in the same batch is stale news.
  const visit = finished.at(-1);
  if (!visit || !shouldLookUp(visit, next.excluded, new Date(visit.leftAt).getHours())) return;

  const accessToken = await currentAccessToken();
  if (!accessToken) {
    // Signed out with the task still running: nothing may be looked up for nobody.
    await stopPlaceVisits();
    return;
  }
  const place = await lookupNearbyPlace(accessToken, visit).catch(() => null);
  if (!place) return;
  if (next.excluded.some((excluded) => excluded.id === place.id)) return;
  if (next.prompted[place.id] !== undefined) return;

  await saveVisitState({ ...next, prompted: { ...next.prompted, [place.id]: now } });
  const payload: VisitNotificationData = {
    placeId: place.id,
    name: place.name,
    kind: place.kind,
    latitude: visit.latitude,
    longitude: visit.longitude,
  };
  await Notifications.scheduleNotificationAsync({
    identifier: PLACE_VISIT_NOTIFICATION_PREFIX + place.id,
    content: {
      title: `Did you spend at ${place.name}?`,
      body: "Tap to log it in Zoption.",
      categoryIdentifier: PLACE_VISIT_CATEGORY_ID,
      data: { ...payload },
    },
    trigger: { channelId: PLACE_VISIT_CHANNEL_ID },
  });
}

async function currentAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
