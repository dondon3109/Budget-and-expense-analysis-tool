import type { PlaceKind } from "@zoption/shared";

/**
 * Pure rules for the place visit prompt. The background task feeds location
 * fixes through `advanceStay` and asks the Worker about a finished stay only
 * when `shouldLookUp` agrees, because each lookup is a paid Places call.
 */

/** Identifier prefix of visit notifications; one notification per place. */
export const PLACE_VISIT_NOTIFICATION_PREFIX = "zoption-place-visit:";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const VISIT_RULES = {
  /** A fix farther than this from the stay's anchor ends the stay. Malls are big. */
  stayRadiusMeters: 120,
  /** Fixes less accurate than this are ignored rather than ending a stay. */
  maxAccuracyMeters: 200,
  minDwellMs: 5 * MINUTE,
  /** Longer stays are most likely home or work, not a shopping stop. */
  maxDwellMs: 4 * HOUR,
  /** One prompt per place in this window. */
  cooldownMs: 4 * HOUR,
  /** A stay this close to an excluded place is never looked up. */
  excludedRadiusMeters: 150,
  quietFromHour: 22,
  quietUntilHour: 7,
} as const;

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

/** Where the device is resting. The anchor moves to the most accurate fix seen. */
export interface Stay {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  arrivedAt: number;
}

/** A stay that ended, with how long the device rested there. */
export interface FinishedStay extends Stay {
  leftAt: number;
}

export interface ExcludedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Folds new fixes into the current stay. Location updates arrive only after the
 * device moves, so a stationary device sends nothing: the stay lasts from its
 * first fix to the first fix outside its radius.
 */
export function advanceStay(
  stay: Stay | null,
  fixes: readonly LocationFix[],
): { stay: Stay | null; finished: FinishedStay[] } {
  const finished: FinishedStay[] = [];
  let current = stay;
  const ordered = [...fixes].sort((a, b) => a.timestamp - b.timestamp);
  for (const fix of ordered) {
    if (fix.accuracy !== null && fix.accuracy > VISIT_RULES.maxAccuracyMeters) continue;
    if (!current) {
      current = startStay(fix);
      continue;
    }
    if (fix.timestamp < current.arrivedAt) continue;
    if (distanceMeters(current, fix) <= VISIT_RULES.stayRadiusMeters) {
      if (fix.accuracy !== null && (current.accuracy === null || fix.accuracy < current.accuracy)) {
        current = {
          ...current,
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy,
        };
      }
      continue;
    }
    finished.push({ ...current, leftAt: fix.timestamp });
    current = startStay(fix);
  }
  return { stay: current, finished };
}

/** Whether a finished stay is worth a Places lookup at all. */
export function shouldLookUp(
  stay: FinishedStay,
  excluded: readonly ExcludedPlace[],
  localHour: number,
): boolean {
  const dwell = stay.leftAt - stay.arrivedAt;
  if (dwell < VISIT_RULES.minDwellMs || dwell > VISIT_RULES.maxDwellMs) return false;
  if (isQuietHour(localHour)) return false;
  return !excluded.some((place) => distanceMeters(place, stay) <= VISIT_RULES.excludedRadiusMeters);
}

export function isQuietHour(hour: number): boolean {
  return hour >= VISIT_RULES.quietFromHour || hour < VISIT_RULES.quietUntilHour;
}

/** Drops prompt times older than the cooldown, so the saved map stays small. */
export function pruneCooldowns(prompted: Record<string, number>, now: number) {
  return Object.fromEntries(
    Object.entries(prompted).filter(([, at]) => now - at < VISIT_RULES.cooldownMs),
  );
}

/** A word `matchCategory` recognizes for the place's kind. */
export function categoryHintFor(kind: PlaceKind): string {
  switch (kind) {
    case "food":
      return "Food";
    case "groceries":
      return "Groceries";
    case "shopping":
      return "Shopping";
    case "health":
      return "Health";
    case "education":
      return "Education";
    case "leisure":
      return "Entertainment";
    case "transport":
      return "Transportation";
    case "personal_care":
      return "Personal care";
  }
}

function startStay(fix: LocationFix): Stay {
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    arrivedAt: fix.timestamp,
  };
}

/** Haversine distance; accurate to well under a metre at these ranges. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
