import { requireOptionalNativeModule } from "expo";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";
import { z } from "zod";

export const PLAY_PACKAGE = "site.zoption.android";
export const PLAY_UPDATE_CHECK_COOLDOWN_MS = 60 * 60 * 1000;
export const DISMISSED_PLAY_UPDATE_KEY = "zoption.play-update.dismissed-version-code";

const nativePlayUpdateResultSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }).strict(),
  z
    .object({
      available: z.literal(true),
      availableVersionCode: z.number().int().positive(),
    })
    .strict(),
]);

interface PlayUpdatesNativeModule {
  checkForUpdateAsync(): Promise<unknown>;
}

export interface AvailablePlayUpdate {
  availableVersionCode: number;
}

/**
 * Android installs update through the Play Store, so its listing is the update destination.
 * `market://` opens the Play Store app; the web listing covers a phone without it.
 */
export async function openPlayListing(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${PLAY_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`);
  }
}

/**
 * Queries Google Play on Android for an update newer than the installed build.
 * Returns null on iOS, in builds without the native module, or when no update is available.
 */
export async function checkForPlayUpdate(): Promise<AvailablePlayUpdate | null> {
  if (Platform.OS !== "android") return null;
  const nativeModule = requireOptionalNativeModule<PlayUpdatesNativeModule>("ZoptionPlayUpdates");
  if (!nativeModule) return null;
  try {
    const raw = await nativeModule.checkForUpdateAsync();
    const parsed = nativePlayUpdateResultSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.available) return null;
    return { availableVersionCode: parsed.data.availableVersionCode };
  } catch {
    return null;
  }
}

export async function readDismissedPlayUpdateVersion(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(DISMISSED_PLAY_UPDATE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveDismissedPlayUpdateVersion(versionCode: number): Promise<void> {
  if (!Number.isInteger(versionCode) || versionCode <= 0) return;
  await SecureStore.setItemAsync(DISMISSED_PLAY_UPDATE_KEY, String(versionCode)).catch(
    () => undefined,
  );
}

/**
 * Prompts once per Play Store versionCode after "Not now", and once per launch session after
 * "Update" so returning from the Play Store does not immediately re-open the dialog.
 */
export function shouldPromptForPlayUpdate(input: {
  availableVersionCode: number;
  dismissedVersionCode: number | null;
  sessionDismissedVersion: number | null;
}): boolean {
  if (
    input.dismissedVersionCode !== null &&
    input.availableVersionCode <= input.dismissedVersionCode
  ) {
    return false;
  }
  if (
    input.sessionDismissedVersion !== null &&
    input.availableVersionCode <= input.sessionDismissedVersion
  ) {
    return false;
  }
  return true;
}

export function shouldRunPlayUpdateCheck(input: {
  lastCheckedAt: number;
  now: number;
  cooldownMs?: number;
}): boolean {
  if (input.lastCheckedAt <= 0) return true;
  return input.now - input.lastCheckedAt >= (input.cooldownMs ?? PLAY_UPDATE_CHECK_COOLDOWN_MS);
}
