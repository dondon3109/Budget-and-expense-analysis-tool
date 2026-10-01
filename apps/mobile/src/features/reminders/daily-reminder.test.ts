import { render, renderHook } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { createElement } from "react";

import {
  useDailyReminderRestoredStore,
  useDailyReminderStore,
} from "@/stores/daily-reminder-store";
import {
  applyDailyReminder,
  clearDailyReminder,
  DAILY_REMINDERS,
  DailyReminderTapHandler,
  startDailyReminder,
  useDailyReminderSession,
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

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(() => ({ key: "root" })),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const notifications = jest.mocked(Notifications);
const NOON = DAILY_REMINDERS[0].id;
const NIGHT = DAILY_REMINDERS[1].id;
const REMINDER_STORAGE_KEY = "zoption-mobile-daily-reminder-v1";

function permission(granted: boolean, canAskAgain = true) {
  return { granted, canAskAgain } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
}

let tapTime = 0;

/** A distinct tap each call: the handler opens the editor once per tap. */
function responseFor(identifier: string, data?: Record<string, unknown>) {
  tapTime += 1;
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: { date: tapTime, request: { identifier, content: { data } } },
  } as unknown as Notifications.NotificationResponse;
}

function saved(enabled: boolean) {
  return JSON.stringify({ state: { enabled }, version: 1 });
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
  useDailyReminderStore.setState({ enabled: true });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
});

describe("daily reminder scheduling", () => {
  it("turning the reminder off cancels both without asking for permission", async () => {
    await expect(applyDailyReminder(false)).resolves.toBe("off");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().enabled).toBe(false);
  });

  it("schedules daily triggers at 12:00 PM and 9:00 PM and saves the choice", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await expect(applyDailyReminder(true)).resolves.toBe("scheduled");

    // Scheduling under the same identifiers replaces the old reminders; cancelling
    // first would leave nothing scheduled if a schedule call then failed.
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: NOON,
        trigger: expect.objectContaining({ type: "daily", hour: 12, minute: 0 }),
      }),
    );
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: NIGHT,
        trigger: expect.objectContaining({ type: "daily", hour: 21, minute: 0 }),
      }),
    );
    expect(useDailyReminderStore.getState().enabled).toBe(true);
  });

  it("asks for permission once and schedules when it is granted", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(true));

    await expect(applyDailyReminder(true)).resolves.toBe("scheduled");

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("turns the reminder off when permission is refused", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(false));

    await expect(applyDailyReminder(true)).resolves.toBe("denied");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().enabled).toBe(false);
  });

  it("keeps the saved choice when scheduling fails", async () => {
    useDailyReminderStore.setState({ enabled: false });
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));
    notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error("native failure"));

    await expect(applyDailyReminder(true)).rejects.toThrow("native failure");

    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().enabled).toBe(false);
  });

  it("does not prompt again once the user has blocked notifications", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false, false));

    await expect(applyDailyReminder(true)).resolves.toBe("denied");

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not bring the reminder back when sign-out lands while it is being scheduled", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));
    const schedule = deferred<string>();
    notifications.scheduleNotificationAsync.mockReturnValueOnce(schedule.promise);

    const applying = applyDailyReminder(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDailyReminder();
    schedule.resolve(NOON);

    await expect(applying).resolves.toBe("off");
    // Two cancels by the cleanup, two more after the late schedule calls returned.
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(4);
  });

  it("does not schedule when sign-out lands while the permission prompt is open", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    const prompt = deferred<Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>>();
    notifications.requestPermissionsAsync.mockReturnValueOnce(prompt.promise);

    const applying = applyDailyReminder(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDailyReminder();
    prompt.resolve(permission(true));

    await expect(applying).resolves.toBe("off");
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("daily reminder identity cleanup", () => {
  it("cancels both reminders, resets the choice to on, and forgets an unhandled tap", async () => {
    useDailyReminderStore.setState({ enabled: false });

    await clearDailyReminder();

    expect(useDailyReminderStore.getState().enabled).toBe(true);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
  });

  it("still cancels the reminders when forgetting the tap throws", async () => {
    notifications.clearLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error("native failure");
    });

    await expect(clearDailyReminder()).rejects.toThrow("native failure");

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
  });
});

describe("daily reminder at launch", () => {
  it("shows the reminders, and only the reminders, while the app is open", async () => {
    await startDailyReminder();

    const handler = notifications.setNotificationHandler.mock.calls[0]?.[0];
    const notificationFor = (identifier: string) =>
      ({ request: { identifier } }) as Notifications.Notification;
    for (const identifier of [NOON, NIGHT]) {
      await expect(handler?.handleNotification(notificationFor(identifier))).resolves.toEqual(
        expect.objectContaining({ shouldShowBanner: true, shouldShowList: true }),
      );
    }
    await expect(handler?.handleNotification(notificationFor("something-else"))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: false, shouldShowList: false }),
    );
  });

  it("schedules both reminders on a first launch, with no saved choice", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(true));

    await startDailyReminder();

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(useDailyReminderStore.getState().enabled).toBe(true);
  });

  it("reschedules without prompting when permission is already granted", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(saved(true));
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await startDailyReminder();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("turns the reminder off when the permission prompt is refused", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(false));
    notifications.requestPermissionsAsync.mockResolvedValue(permission(false));

    await startDailyReminder();

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(useDailyReminderStore.getState().enabled).toBe(false);
  });

  it("keeps the choice across a relaunch", async () => {
    // A storage mock that keeps what is written: the restore must read the
    // saved choice before anything writes the in-memory default over it.
    const storage = new Map([[REMINDER_STORAGE_KEY, saved(false)]]);
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation(async (key) => storage.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      storage.set(key, value);
    });

    await startDailyReminder();

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useDailyReminderStore.getState().enabled).toBe(false);
    expect(storage.get(REMINDER_STORAGE_KEY)).toContain("false");
  });

  it("marks the restore finished even when it fails", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(saved(true));
    notifications.getPermissionsAsync.mockRejectedValueOnce(new Error("native failure"));

    await expect(startDailyReminder()).rejects.toThrow("native failure");

    expect(useDailyReminderRestoredStore.getState().restored).toBe(true);
  });

  it("cancels stray reminders when the saved choice is off", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(saved(false));

    await startDailyReminder();

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
  });

  it("keeps an identity change's reset when it lands while the saved choice loads", async () => {
    const stored = deferred<string | null>();
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation((key) =>
        key === REMINDER_STORAGE_KEY ? stored.promise : Promise.resolve(null),
      );
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    const starting = startDailyReminder();
    await clearDailyReminder();
    stored.resolve(saved(true));
    await starting;

    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("daily reminder session binding", () => {
  it("waits while the session is still loading", async () => {
    await renderHook(() => useDailyReminderSession("loading"));

    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.setNotificationHandler).not.toHaveBeenCalled();
  });

  it("clears the reminders when the app launches signed out", async () => {
    // The session ended while the app was closed: no identity transition runs.
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await renderHook(() => useDailyReminderSession("signed-out"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NOON);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(NIGHT);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules the reminders once the session is signed in", async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    await renderHook(() => useDailyReminderSession("signed-in"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps a choice made while the saved one is still loading", async () => {
    const stored = deferred<string | null>();
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation((key) =>
        key === REMINDER_STORAGE_KEY ? stored.promise : Promise.resolve(null),
      );
    notifications.getPermissionsAsync.mockResolvedValue(permission(true));

    const starting = startDailyReminder();
    const applying = applyDailyReminder(false);
    // Let an unguarded apply finish before the saved choice arrives.
    await new Promise((resolve) => setTimeout(resolve, 0));
    stored.resolve(saved(true));
    await starting;

    await expect(applying).resolves.toBe("off");
    expect(useDailyReminderStore.getState().enabled).toBe(false);
  });
});

describe("daily reminder tap", () => {
  it("opens the transaction editor for the tap that launched the app, once", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(responseFor(NOON));

    await render(createElement(DailyReminderTapHandler));

    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it("opens the editor for a tap while the app is running", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(null);
    await render(createElement(DailyReminderTapHandler));
    const listener = notifications.addNotificationResponseReceivedListener.mock.calls[0]?.[0];

    listener?.(responseFor(NOON));

    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");
  });

  it("opens the editor once when the launching tap also reaches the listener", async () => {
    const launchTap = responseFor(NOON);
    notifications.getLastNotificationResponse.mockReturnValue(launchTap);

    await render(createElement(DailyReminderTapHandler));
    const listener = notifications.addNotificationResponseReceivedListener.mock.calls[0]?.[0];
    listener?.(launchTap);

    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("waits for the navigator before opening the editor on a cold start", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(responseFor(NOON));
    const navigationState = jest.mocked(useRootNavigationState);
    navigationState.mockReturnValue(
      undefined as unknown as ReturnType<typeof useRootNavigationState>,
    );

    const view = await render(createElement(DailyReminderTapHandler));
    expect(router.push).not.toHaveBeenCalled();

    navigationState.mockReturnValue({ key: "root" } as ReturnType<typeof useRootNavigationState>);
    await view.rerender(createElement(DailyReminderTapHandler));

    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");
  });

  it("opens the confirm screen when a widget review note is tapped", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(
      responseFor("zoption-widget-review", { transcript: "adjust BDO to 5,000" }),
    );

    await render(createElement(DailyReminderTapHandler));

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/widget-intent?transcript=adjust%20BDO%20to%205%2C000",
    );
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });

  it("ignores other notifications", async () => {
    notifications.getLastNotificationResponse.mockReturnValue(responseFor("something-else"));

    await render(createElement(DailyReminderTapHandler));

    expect(router.push).not.toHaveBeenCalled();
    expect(notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });
});
