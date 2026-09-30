import { nearbyPlaceSchema, type NearbyPlace, type PlaceKind } from "@zoption/shared";
import { z } from "zod";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

/** Resolves a coordinate to the closest spending-relevant place, or null. */
export interface PlacesProvider {
  nearby(
    env: Bindings,
    point: { latitude: number; longitude: number },
  ): Promise<NearbyPlace | null>;
}

const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
// A visit is detected from the device's resting fix, which is usually within a
// few tens of metres indoors. Wider than this starts matching the neighbours.
const SEARCH_RADIUS_METERS = 60;
const TIMEOUT_MS = 8_000;

/**
 * Google Places (New) Table A types, grouped into the kinds the app prompts for.
 * Every key is sent as `includedTypes`, so an invalid type fails every lookup.
 */
const PLACE_TYPE_KINDS: Record<string, PlaceKind> = {
  restaurant: "food",
  fast_food_restaurant: "food",
  cafe: "food",
  coffee_shop: "food",
  bakery: "food",
  bar: "food",
  meal_takeaway: "food",
  supermarket: "groceries",
  grocery_store: "groceries",
  convenience_store: "groceries",
  market: "groceries",
  food_store: "groceries",
  liquor_store: "groceries",
  shopping_mall: "shopping",
  department_store: "shopping",
  clothing_store: "shopping",
  shoe_store: "shopping",
  electronics_store: "shopping",
  hardware_store: "shopping",
  home_goods_store: "shopping",
  furniture_store: "shopping",
  book_store: "shopping",
  jewelry_store: "shopping",
  pet_store: "shopping",
  sporting_goods_store: "shopping",
  pharmacy: "health",
  hospital: "health",
  doctor: "health",
  dental_clinic: "health",
  school: "education",
  university: "education",
  park: "leisure",
  amusement_park: "leisure",
  movie_theater: "leisure",
  gym: "leisure",
  gas_station: "transport",
  parking: "transport",
  beauty_salon: "personal_care",
  hair_care: "personal_care",
};

const INCLUDED_TYPES = Object.keys(PLACE_TYPE_KINDS);

const nearbyResponseSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.object({ text: z.string() }).optional(),
        primaryType: z.string().optional(),
        types: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

/** The kind for a Places result: its primary type first, then its other types in order. */
export function placeKindFor(primaryType: string | undefined, types: readonly string[] = []) {
  for (const type of [primaryType, ...types]) {
    const kind = type ? PLACE_TYPE_KINDS[type] : undefined;
    if (kind) return kind;
  }
  return null;
}

export function createGooglePlacesProvider(fetchImpl: typeof fetch = fetch): PlacesProvider {
  return {
    async nearby(env, { latitude, longitude }) {
      const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
      if (!apiKey) {
        throw new HttpError(503, "places_unavailable", "Place lookup is not configured.");
      }
      let response: Response;
      try {
        response = await fetchImpl(NEARBY_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            // The field mask decides the billing SKU; id, name, and types stay on the cheapest one.
            "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.types",
          },
          body: JSON.stringify({
            includedTypes: INCLUDED_TYPES,
            maxResultCount: 1,
            rankPreference: "DISTANCE",
            locationRestriction: {
              circle: { center: { latitude, longitude }, radius: SEARCH_RADIUS_METERS },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new HttpError(503, "places_unavailable", "Place lookup is unavailable right now.");
      }
      if (!response.ok) {
        // Never log the request: it carries the user's coordinates.
        console.error(JSON.stringify({ event: "places_lookup_failed", status: response.status }));
        throw new HttpError(503, "places_unavailable", "Place lookup is unavailable right now.");
      }
      const parsed = nearbyResponseSchema.safeParse(await response.json().catch(() => null));
      const first = parsed.success ? parsed.data.places?.[0] : undefined;
      if (!first) return null;
      const kind = placeKindFor(first.primaryType, first.types);
      const place = nearbyPlaceSchema.safeParse({
        id: first.id,
        name: first.displayName?.text.slice(0, 120),
        kind,
      });
      return place.success ? place.data : null;
    },
  };
}
