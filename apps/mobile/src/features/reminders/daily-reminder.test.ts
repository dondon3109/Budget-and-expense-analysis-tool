import { render } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { createElement } from "react";

import { useDailyReminderStore } from "@/stores/daily-reminder-store";
import {
  applyDailyReminder,
  clearDailyReminder,
  dailyReminderLabel,
  DAILY_REMINDER_ID,
  DailyReminderTapHandler,
  startDailyReminder,
} from "./daily-reminder";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => "zoption-daily-reminder"),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const notifications = jest.mocked(Notifications);
const REMINDER_STORAGE_KEY = "zoption-mobile-daily-reminder-v1";

function permission(granted: boolean, canAskAgain = true) {
  return { granted, canAskAgain } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
}

function responseFor(identifier: string) {
  return { notification: { request: { identifier } } } as Notifications.NotificationResponse;
}

function savedTime(time: string) {
  return JSON.stringify({ state: { time }, version: 1 });
}

/** A promise the test settles by hand, to hold a native call in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  useDailyReminderStore.setState({ time: "off" });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

describe("daily reminder scheduling", () => {
  it("labels reminder times in 12-hour form", () => {
    expect(dailyReminderLabel("off")).toBe("Off");
    expect(dailyReminderLabel("08:00")).toBe("8:00 AM");
    expect(dailyReminderLabel("12:00")).toBe("12:00 PM");
    expect(dailyReminderLabel("21:00")).toBe("9:00 PM");
  });

  it("turning the reminder off cancels it without asking for permission", async () => {
    useDailyReminderStore.setState({ time: "21:00" });

    await expect(applyDailyReminder("off")).resolves.toBe("off");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().time).toBe("off");
  });

  it("replaces the reminder with one daily trigger at the chosen time and saves it", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await expect(applyDailyReminder("21:00")).resolves.toBe("scheduled");

    // Scheduling under the same identifier replaces the old reminder; cancelling
    // first would leave nothing scheduled if the schedule call then failed.
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: DAILY_REMINDER_ID,
        trigger: expect.objectContaining({ type: "daily", hour: 21, minute: 0 }),
      }),
    );
    expect(useDailyReminderStore.getState().time).toBe("21:00");
  });

  it("asks for permission once and schedules when it is granted", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(true));

    await expect(applyDailyReminder("08:00")).resolves.toBe("scheduled");

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("turns the reminder off when permission is refused", async () => {
    useDailyReminderStore.setState({ time: "12:00" });
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(false));

    await expect(applyDailyReminder("18:00")).resolves.toBe("denied");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().time).toBe("off");
  });

  it("keeps the previous reminder and saved time when scheduling fails", async () => {
    useDailyReminderStore.setState({ time: "12:00" });
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));
    notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error("native failure"));

    await expect(applyDailyReminder("08:00")).rejects.toThrow("native failure");

    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().time).toBe("12:00");
  });

  it("does not prompt again once the user has blocked notifications", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false, false));

    await expect(applyDailyReminder("18:00")).resolves.toBe("denied");

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not bring the reminder back when sign-out lands while it is being scheduled", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));
    const schedule = deferred<string>();
    notifications.scheduleNotificationAsync.mockReturnValueOnce(schedule.promise);

    const applying = applyDailyReminder("21:00");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDailyReminder();
    schedule.resolve(DAILY_REMINDER_ID);

    await expect(applying).resolves.toBe("off");
    expect(useDailyReminderStore.getState().time).toBe("off");
    // Once by the cleanup, once more after the late schedule call returned.
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("does not schedule when sign-out lands while the permission prompt is open", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    const prompt = deferred<Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>>();
    notifications.requestPermissionsAsync.mockReturnValueOnce(prompt.promise);

    const applying = applyDailyReminder("08:00");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDailyReminder();
    prompt.resolve(permission(true));

    await expect(applying).resolves.toBe("off");
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().time).toBe("off");
  });
});

describe("daily reminder identity cleanup", () => {
  it("turns the reminder off and forgets an unhandled tap", async () => {
    useDailyReminderStore.setState({ time: "21:00" });

    await clearDailyReminder();

    expect(useDailyReminderStore.getState().time).toBe("off");
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
  });

  it("still cancels the reminder when forgetting the tap throws", async () => {
    notifications.clearLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error("native failure");
    });

    await expect(clearDailyReminder()).rejects.toThrow("native failure");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(useDailyReminderStore.getState().time).toBe("off");
  });
});

describe("daily reminder at launch", () => {
  it("shows the reminder, and only the reminder, while the app is open", async () => {
    await startDailyReminder();

    const handler = notifications.setNotificationHandler.mock.calls[0]?.[0];
    const notificationFor = (identifier: string) =>
      ({ request: { identifier } }) as Notifications.Notification;
    await expect(handler?.handleNotification(notificationFor(DAILY_REMINDER_ID))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: true, shouldShowList: true }),
    );
    await expect(handler?.handleNotification(notificationFor("something-else"))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: false, shouldShowList: false }),
    );
  });

  it("reschedules the saved time without prompting", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(savedTime("18:00"));
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await startDailyReminder();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ hour: 18, minute: 0 }) }),
    );
    expect(useDailyReminderStore.getState().time).toBe("18:00");
  });

  it("resets the saved time to off when permission was revoked", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(savedTime("18:00"));
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));

    await startDailyReminder();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
    expect(useDailyReminderStore.getState().time).toBe("off");
  });

  it("cancels a stray reminder when the saved time is off", async () => {
    await startDailyReminder();

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(DAILY_REMINDER_ID);
  });

  it("keeps an identity change's off when it lands while the saved time loads", async () => {
    const stored = deferred<string | null>();
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation((key) =>
        key === REMINDER_STORAGE_KEY ? stored.promise : Promise.resolve(null),
      );
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    const starting = startDailyReminder();
    await clearDailyReminder();
    stored.resolve(savedTime("21:00"));
    await starting;

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().time).toBe("off");
  });
});

describe("daily reminder tap", () => {
  it("opens the transaction editor for the tap that launched the app, once", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(responseFor(DAILY_REMINDER_ID));

    await render(createElement(DailyReminderTapHandler));

    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it("opens the editor for a tap while the app is running", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(null);
    await render(createElement(DailyReminderTapHandler));
    const listener = notifications.addNotificationResponseReceivedListener.mock.calls[0]?.[0];

    listener?.(responseFor(DAILY_REMINDER_ID));

    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");
  });

  it("ignores other notifications", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(responseFor("something-else"));

    await render(createElement(DailyReminderTapHandler));

    expect(router.push).not.toHaveBeenCalled();
    expect(notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });
});
