import * as SecureStore from "expo-secure-store";
import { z } from "zod";

import { UPDATE_PERSISTENCE_KEY } from "./constants";
import type { ReservedApk } from "./apk-cleanup";

const persistedUpdateSchema = z
  .object({
    lastSuccessfulCheckAt: z.number().int().nonnegative(),
    dismissedVersionCode: z.number().int().positive().optional(),
    reservedApkUri: z.string().min(1).optional(),
    reservedUntil: z.number().int().nonnegative().optional(),
    lastRelease: z.unknown().optional(),
  })
  .strict();

export interface UpdatePersistenceState {
  lastSuccessfulCheckAt: number;
  dismissedVersionCode?: number;
  reserved: ReservedApk | null;
  lastRelease?: unknown;
}

export function parseUpdatePersistence(value: unknown): UpdatePersistenceState {
  const parsed = persistedUpdateSchema.safeParse(value);
  if (!parsed.success) {
    return { lastSuccessfulCheckAt: 0, reserved: null };
  }
  const reserved =
    parsed.data.reservedApkUri && parsed.data.reservedUntil
      ? { uri: parsed.data.reservedApkUri, reservedUntil: parsed.data.reservedUntil }
      : null;
  return {
    lastSuccessfulCheckAt: parsed.data.lastSuccessfulCheckAt,
    dismissedVersionCode: parsed.data.dismissedVersionCode,
    reserved,
    lastRelease: parsed.data.lastRelease,
  };
}

export function shouldSkipAutomaticCheck(input: {
  lastSuccessfulCheckAt: number;
  now: number;
  intervalMs: number;
}): boolean {
  if (input.lastSuccessfulCheckAt <= 0) return false;
  return input.now - input.lastSuccessfulCheckAt < input.intervalMs;
}

export function shouldShowAutomaticPrompt(input: {
  versionCode: number;
  dismissedVersionCode?: number;
}): boolean {
  return input.dismissedVersionCode !== input.versionCode;
}

function serialize(state: UpdatePersistenceState): string {
  return JSON.stringify({
    lastSuccessfulCheckAt: state.lastSuccessfulCheckAt,
    dismissedVersionCode: state.dismissedVersionCode,
    reservedApkUri: state.reserved?.uri,
    reservedUntil: state.reserved?.reservedUntil,
    lastRelease: state.lastRelease,
  });
}

export async function loadUpdatePersistence(
  getItem: (key: string) => Promise<string | null> = (key) => SecureStore.getItemAsync(key),
): Promise<UpdatePersistenceState> {
  try {
    const raw = await getItem(UPDATE_PERSISTENCE_KEY);
    if (!raw) return { lastSuccessfulCheckAt: 0, reserved: null };
    return parseUpdatePersistence(JSON.parse(raw) as unknown);
  } catch {
    return { lastSuccessfulCheckAt: 0, reserved: null };
  }
}

export async function saveUpdatePersistence(
  state: UpdatePersistenceState,
  setItem: (key: string, value: string) => Promise<void> = (key, value) =>
    SecureStore.setItemAsync(key, value),
): Promise<void> {
  await setItem(UPDATE_PERSISTENCE_KEY, serialize(state));
}
