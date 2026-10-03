// The widget logs in the background, so a notification is the only place it can
// answer. A "review" notification is one the user can tap to finish in the app.

import type { Href } from "expo-router";

export const WIDGET_NOTIFICATION_PREFIX = "zoption-widget-";
export const WIDGET_REVIEW_NOTIFICATION_ID = `${WIDGET_NOTIFICATION_PREFIX}review`;

export function isWidgetNotification(identifier: string | undefined): boolean {
  return identifier?.startsWith(WIDGET_NOTIFICATION_PREFIX) ?? false;
}

/** The widget-intent route that confirms a spoken note in the app. */
export function widgetReviewRoute(transcript: string): Href {
  return `/(app)/widget-intent?transcript=${encodeURIComponent(transcript)}`;
}

/** The route a tapped widget notification opens, or null for any other notification. */
export function widgetNotificationRoute(
  identifier: string | undefined,
  data: Record<string, unknown> | undefined,
): Href | null {
  if (identifier !== WIDGET_REVIEW_NOTIFICATION_ID) return null;
  const transcript = data?.transcript;
  return typeof transcript === "string" && transcript.trim() ? widgetReviewRoute(transcript) : null;
}
