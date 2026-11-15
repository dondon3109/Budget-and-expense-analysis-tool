import type { SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { readDeviceBootCount } from "@/db/local-data-security";

import { withSessionRemovalAllowed } from "./secure-session-storage";

/** SecureStore key for the Android boot count that last saved a session. Not a secret. */
export const ANDROID_BOOT_COUNT_KEY = "zoption.session.android_boot";

/**
 * A stored session ends when Android reports a different boot than the one that
 * saved it. A missing stamp (the first launch after this shipped, or a failed
 * read) does not end it: failing open keeps a signed-in phone signed in.
 */
export function sessionEndedWithDeviceBoot(
  storedBootCount: number | null,
  currentBootCount: number | null,
): boolean {
  if (currentBootCount === null || storedBootCount === null) return false;
  return storedBootCount !== currentBootCount;
}

function parseBootCount(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const count = Number(raw);
  return Number.isSafeInteger(count) ? count : null;
}

/** Null off Android, and when the OS will not say how many times it has booted. */
export async function readAndroidBootCount(): Promise<number | null> {
  if (Platform.OS !== "android") return null;
  try {
    const count = await readDeviceBootCount();
    return Number.isInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

export async function readStoredAndroidBootCount(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(ANDROID_BOOT_COUNT_KEY).catch(() => null);
  return parseBootCount(raw);
}

export async function rememberAndroidBootCount(count: number): Promise<void> {
  await SecureStore.setItemAsync(ANDROID_BOOT_COUNT_KEY, String(count)).catch(() => undefined);
}

export async function clearAndroidBootCount(): Promise<void> {
  await SecureStore.deleteItemAsync(ANDROID_BOOT_COUNT_KEY).catch(() => undefined);
}

/**
 * Drops the Supabase session after a phone restart. The encrypted workspace
 * stays, so the next sign-in opens the same local data, including anything
 * that had not synced yet.
 */
export async function endSessionBecauseDeviceRestarted(client: SupabaseClient): Promise<void> {
  await withSessionRemovalAllowed(async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  });
  await clearAndroidBootCount();
}
