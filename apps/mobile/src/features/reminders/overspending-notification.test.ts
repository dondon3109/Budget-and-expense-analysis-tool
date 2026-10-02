import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import {
  announceOverspending,
  clearOverspendingNotification,
  OVERSPENDING_NOTIFICATION_ID,
  overspendingAlertKey,
} from "./overspending-notification";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const notifications = jest.mocked(Notifications);
const secureStore = jest.mocked(SecureStore);
const STORAGE_KEY = "zoption-mobile-overspending-alert-v1";
const MESSAGE = { title: "Deficit risk ahead", body: "Below zero on 2026-10-15." };

function permission(granted: boolean) {
  return { granted, canAskAgain: true } as Awaited<
    ReturnType<typeof Notifications.getPermissionsAsync>
  >;
}

beforeEach(() => {
  jest.clearAllMocks();
  secureStore.getItemAsync.mockResolvedValue(null);
  notifications.getPermissionsAsync.mockResolvedValue(permission(true));
});

describe("overspendingAlertKey", () => {
  it("keys a spent-out week by its Monday and a deficit by its date", () => {
    // Thursday 2026-10-08 belongs to the week starting Monday 2026-10-05.
    const thursday = new Date(2026, 9, 8, 12);
    expect(overspendingAlertKey({ kind: "overspent" }, thursday)).toBe("overspent:2026-10-05");
    expect(overspendingAlertKey({ kind: "overspent" }, new Date(2026, 9, 11, 12))).toBe(
      "overspent:2026-10-05",
    );
    expect(
      overspendingAlertKey({ kind: "deficit_risk", deficitDate: "2026-10-15" }, thursday),
    ).toBe("deficit:2026-10-15");
  });
});

describe("announceOverspending", () => {
  it("posts the alert once and records the condition", async () => {
    await announceOverspending("deficit:2026-10-15", MESSAGE);

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: OVERSPENDING_NOTIFICATION_ID, content: MESSAGE }),
    );
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEY, "deficit:2026-10-15");
  });

  it("stays quiet for a condition already announced", async () => {
    secureStore.getItemAsync.mockResolvedValue("deficit:2026-10-15");

    await announceOverspending("deficit:2026-10-15", MESSAGE);

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("never asks for permission and leaves the condition unrecorded without it", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));

    await announceOverspending("overspent:2026-10-05", MESSAGE);

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("drops an announcement that an identity change overtook", async () => {
    let grant!: (value: ReturnType<typeof permission>) => void;
    notifications.getPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );

    const pending = announceOverspending("overspent:2026-10-05", MESSAGE);
    await clearOverspendingNotification();
    grant(permission(true));
    await pending;

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe("clearOverspendingNotification", () => {
  it("forgets the announced condition and removes the posted alert", async () => {
    await clearOverspendingNotification();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
    expect(notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      OVERSPENDING_NOTIFICATION_ID,
    );
  });
});
