import * as SecureStore from "expo-secure-store";
import { z } from "zod";

/**
 * On-device state for place visit prompts, read by the headless location task
 * as well as the settings card. It never leaves the phone and holds no visit
 * history: only the stay in progress, recent prompt times for the cooldown, and
 * the places the user excluded.
 */

const STORAGE_KEY = "zoption-place-visits-v1";
export const MAX_EXCLUDED_PLACES = 20;

const coordinate = { latitude: z.number(), longitude: z.number() };

const visitStateSchema = z
  .object({
    stay: z
      .object({ ...coordinate, accuracy: z.number().nullable(), arrivedAt: z.number() })
      .strict()
      .nullable(),
    prompted: z.record(z.string(), z.number()),
    excluded: z
      .array(z.object({ id: z.string(), name: z.string(), ...coordinate }).strict())
      .max(MAX_EXCLUDED_PLACES),
  })
  .strict();

export type VisitState = z.infer<typeof visitStateSchema>;

const emptyState: VisitState = { stay: null, prompted: {}, excluded: [] };

export async function loadVisitState(): Promise<VisitState> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = visitStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyState;
  } catch {
    return emptyState;
  }
}

export function saveVisitState(state: VisitState): Promise<void> {
  return SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state));
}

export function clearVisitState(): Promise<void> {
  return SecureStore.deleteItemAsync(STORAGE_KEY);
}
