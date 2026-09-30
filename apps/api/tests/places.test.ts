import { describe, expect, it, vi } from "vitest";

import { createGooglePlacesProvider, placeKindFor } from "../src/places/google-places";
import type { Bindings } from "../src/types";
import { createAppWithFakes, privateHeaders } from "./helpers/app-fakes";

const env = { GOOGLE_PLACES_API_KEY: "test-key" } as Bindings;
const point = { latitude: 14.6507, longitude: 121.0304 };

function placesResponse(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("Google Places provider", () => {
  it("returns the closest place with its kind and sends a cheap field mask", async () => {
    const fetchImpl = placesResponse({
      places: [
        {
          id: "ChIJmall",
          displayName: { text: "SM North EDSA" },
          primaryType: "shopping_mall",
          types: ["shopping_mall", "point_of_interest"],
        },
      ],
    });

    const place = await createGooglePlacesProvider(fetchImpl).nearby(env, point);

    expect(place).toEqual({ id: "ChIJmall", name: "SM North EDSA", kind: "shopping" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe(
      "places.id,places.displayName,places.primaryType,places.types",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      maxResultCount: 1,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: point } },
    });
  });

  it("returns null when nothing spending-relevant is nearby", async () => {
    await expect(createGooglePlacesProvider(placesResponse({})).nearby(env, point)).resolves.toBe(
      null,
    );
  });

  it("answers 503 without a key or when Google fails, never calling out without a key", async () => {
    const fetchImpl = placesResponse({});
    await expect(
      createGooglePlacesProvider(fetchImpl).nearby({} as Bindings, point),
    ).rejects.toMatchObject({ status: 503, code: "places_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      createGooglePlacesProvider(placesResponse({ error: {} }, 403)).nearby(env, point),
    ).rejects.toMatchObject({ status: 503 });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("14.65");
    errorSpy.mockRestore();
  });

  it("falls back from an unmapped primary type to the first mapped secondary type", () => {
    expect(placeKindFor("food_court", ["point_of_interest", "restaurant"])).toBe("food");
    expect(placeKindFor("church", ["place_of_worship"])).toBe(null);
  });
});

describe("POST /api/app/places/nearby", () => {
  it("validates coordinates and returns the provider's place", async () => {
    const nearby = vi.fn(async () => ({ id: "p1", name: "Jollibee", kind: "food" as const }));
    const app = createAppWithFakes({ placesProvider: { nearby } });

    const invalid = await app.request("/api/app/places/nearby", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ latitude: 91, longitude: 0 }),
    });
    expect(invalid.status).toBe(400);

    const response = await app.request("/api/app/places/nearby", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(point),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      place: { id: "p1", name: "Jollibee", kind: "food" },
    });
    expect(nearby).toHaveBeenCalledTimes(1);
  });
});
