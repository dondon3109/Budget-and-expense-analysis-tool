import { useNetInfo } from "@react-native-community/netinfo";
import { familyPushDataSchema, type FamilyPushData } from "@zoption/shared";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState, type Href } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";

import { useActiveWorkspace } from "./active-workspace";
import { familyOpenable } from "./workspace-record";

/** What a family push opens once its family is shown: the entry, the remittance, or Home. */
export function familyTapRoute(data: FamilyPushData): Href {
  if (data.subjectKind === "transaction" && data.subjectId) {
    return { pathname: "/(app)/transaction", params: { id: data.subjectId } };
  }
  if (data.subjectKind === "remittance" && data.subjectId) {
    return { pathname: "/(app)/remittance", params: { id: data.subjectId } };
  }
  return "/(app)/(tabs)";
}

// Switching families reopens the local workspace, which remounts this handler, so the tap
// waiting for its family and the last tap handled live outside the component.
let waiting: FamilyPushData | null = null;
let handledTap: string | null = null;

/**
 * Opens a family push: switches to its family (personal stays untouched until then), and once
 * that family's file is open, goes to the entry or remittance the push is about.
 */
export function FamilyPushTapHandler() {
  const active = useActiveWorkspace();
  const netInfo = useNetInfo();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const { family, families, synced, switchTo, refresh } = active;

  useEffect(() => {
    if (!navigationReady) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = familyPushDataSchema.safeParse(response.notification.request.content.data);
      if (!data.success) return;
      const tap = `${response.notification.date}:${response.actionIdentifier}`;
      if (tap === handledTap) return;
      handledTap = tap;
      Notifications.clearLastNotificationResponse();
      if (!families.some((item) => item.id === data.data.workspaceId)) {
        // A family joined since the list was last read; the next refresh brings it.
        refresh();
        return;
      }
      if (!familyOpenable(data.data.workspaceId, synced, reachable)) {
        Alert.alert("Connect to open this family", "It opens offline after its first sync.");
        return;
      }
      if (family?.id === data.data.workspaceId) {
        router.push(familyTapRoute(data.data));
        return;
      }
      waiting = data.data;
      switchTo(data.data.workspaceId);
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [families, family?.id, navigationReady, reachable, refresh, switchTo, synced]);

  // Mounted again inside the family's open workspace: finish the tap that switched to it.
  useEffect(() => {
    if (!navigationReady || !waiting || waiting.workspaceId !== family?.id) return;
    const route = familyTapRoute(waiting);
    waiting = null;
    router.push(route);
  }, [family?.id, navigationReady]);

  return null;
}
