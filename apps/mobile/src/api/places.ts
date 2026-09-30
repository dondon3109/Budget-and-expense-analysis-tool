import { placeLookupResponseSchema, type NearbyPlace } from "@zoption/shared";

import { apiRequest } from "./authenticated";

/** The closest spending-relevant place to a point, or null. Each call is a paid lookup. */
export async function lookupNearbyPlace(
  accessToken: string,
  point: { latitude: number; longitude: number },
): Promise<NearbyPlace | null> {
  const response = await apiRequest({
    accessToken,
    path: "/api/app/places/nearby",
    method: "POST",
    body: point,
    fallback: "Zoption could not look up this place.",
    decode: (value) => placeLookupResponseSchema.parse(value),
    timeoutMs: 15_000,
  });
  return response.place;
}
