// Nearby place lookup for the mobile "did you spend here?" prompt.

import { z } from "zod";

/** Spending-relevant place groups. The mobile app maps each to a category hint. */
export const placeKinds = [
  "food",
  "groceries",
  "shopping",
  "health",
  "education",
  "leisure",
  "transport",
  "personal_care",
] as const;

export type PlaceKind = (typeof placeKinds)[number];

export const placeLookupRequestSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

export type PlaceLookupRequest = z.infer<typeof placeLookupRequestSchema>;

export const nearbyPlaceSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(placeKinds),
  })
  .strict();

export type NearbyPlace = z.infer<typeof nearbyPlaceSchema>;

/** `place` is null when nothing spending-relevant is close enough. */
export const placeLookupResponseSchema = z.object({ place: nearbyPlaceSchema.nullable() }).strict();

export type PlaceLookupResponse = z.infer<typeof placeLookupResponseSchema>;
