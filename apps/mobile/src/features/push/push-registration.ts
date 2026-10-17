import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerPushDevice, unregisterPushDevice } from "@/api/push";

/** Must match `PUSH_ANDROID_CHANNEL` in the Worker's push sender. */
export const PUSH_CHANNEL_ID = "family";

/** The token this install last registered for the signed-in person, cleared on sign-out. */
let registeredToken: string | null = null;

/**
 * The EAS project id that Expo push tokens belong to, or null when this build was made without
 * one. Push is Android only for now: the iOS build strips the push entitlement.
 */
export function pushProjectId(): string | null {
  if (Platform.OS !== "android") return null;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const projectId = extra?.eas?.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

/**
 * Registers this install for server push. It never asks for notification permission: the daily
 * reminder asks once, and push uses whatever grant that left. Without a grant or a configured
 * project it does nothing, so a build without push credentials stays as it was.
 */
export async function registerForPush(accessToken: string): Promise<string | null> {
  const projectId = pushProjectId();
  if (!projectId) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Family updates",
    importance: Notifications.AndroidImportance.HIGH,
  });
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushDevice({ accessToken }, { token, platform: "android" });
  registeredToken = token;
  return token;
}

/**
 * Best effort on sign-out, with a short ceiling so an offline sign-out is not held up. If it
 * fails the token stays on the server until another account signs in here or Expo reports it gone.
 */
export async function unregisterForPush(accessToken: string): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await unregisterPushDevice({ accessToken, timeoutMs: 5_000 }, token);
}
