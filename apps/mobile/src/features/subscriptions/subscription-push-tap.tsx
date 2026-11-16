import { subscriptionPushDataSchema } from "@zoption/shared";
import * as Notifications from "expo-notifications";
import { useRootNavigationState } from "expo-router";

import { openBills } from "@/features/budgets/open-bills";
import { useEffect } from "react";

import { useActiveWorkspace } from "@/features/family/active-workspace";

// Switching to personal reopens the local workspace and remounts this handler, so the bill
// waiting for it and the last tap handled live outside the component.
let waiting: string | null = null;
let handledTap: string | null = null;

/**
 * Opens a Subscription ROI nudge on Bills with that bill highlighted. Bills are personal only,
 * so a family shown at the time is switched back to personal first.
 */
export function SubscriptionPushTapHandler() {
  const { family, switchTo } = useActiveWorkspace();
  const navigationReady = Boolean(useRootNavigationState()?.key);

  useEffect(() => {
    if (!navigationReady) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = subscriptionPushDataSchema.safeParse(response.notification.request.content.data);
      if (!data.success) return;
      const tap = `${response.notification.date}:${response.actionIdentifier}`;
      if (tap === handledTap) return;
      handledTap = tap;
      Notifications.clearLastNotificationResponse();
      if (family) {
        waiting = data.data.subscriptionId;
        switchTo(null);
        return;
      }
      openBills(data.data.subscriptionId);
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [family, navigationReady, switchTo]);

  // Mounted again in the personal workspace: finish the tap that switched to it.
  useEffect(() => {
    if (!navigationReady || !waiting || family) return;
    const highlight = waiting;
    waiting = null;
    openBills(highlight);
  }, [family, navigationReady]);

  return null;
}
