import type { PushCategory } from "@zoption/shared";

import type { PushRepository } from "./db/push";
import type { Bindings } from "./types";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;
/** The Android channel the app creates for server push; see the mobile push registration. */
export const PUSH_ANDROID_CHANNEL = "family";

export interface PushMessage {
  userIds: string[];
  category: PushCategory;
  title: string;
  body: string;
  /** In-app path the notification opens, such as `/family`. */
  path?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/**
 * Sends one notification to every device of the given people who have not turned its category
 * off, through the Expo push service. A token Expo reports as no longer registered is deleted.
 * Delivery is best effort: a failed request throws so a queued caller can retry.
 */
export async function sendPush(
  env: Bindings,
  push: PushRepository,
  message: PushMessage,
  fetcher: typeof fetch = fetch,
): Promise<{ sent: number; removed: number }> {
  const tokens = await push.deliveryTokens(env, message.userIds, message.category);
  const stale: string[] = [];
  for (let start = 0; start < tokens.length; start += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(start, start + EXPO_BATCH_SIZE);
    const response = await fetcher(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // Only required once "enhanced push security" is on for the Expo project.
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          sound: "default",
          channelId: PUSH_ANDROID_CHANNEL,
          data: message.path ? { path: message.path } : {},
        })),
      ),
    });
    if (!response.ok) throw new Error(`Expo push failed (${response.status})`);
    const { data } = await response.json<{ data?: ExpoTicket[] }>();
    // Tickets come back in request order.
    data?.forEach((ticket, index) => {
      const token = batch[index];
      if (token && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        stale.push(token);
      }
    });
  }
  await push.removeTokens(env, stale);
  return { sent: tokens.length - stale.length, removed: stale.length };
}
