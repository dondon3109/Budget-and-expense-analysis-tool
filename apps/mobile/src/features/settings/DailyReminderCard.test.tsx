import { fireEvent, render, screen } from "@testing-library/react-native";

import { applyDailyReminder } from "@/features/reminders/daily-reminder";
import {
  useDailyReminderRestoredStore,
  useDailyReminderStore,
} from "@/stores/daily-reminder-store";
import { DailyReminderCard } from "./DailyReminderCard";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// Scheduling is covered in daily-reminder.test.ts; the card only reacts to its result.
jest.mock("@/features/reminders/daily-reminder", () => ({
  ...jest.requireActual<object>("@/features/reminders/daily-reminder"),
  applyDailyReminder: jest.fn(),
}));
jest.mock("expo-notifications", () => ({}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(),
}));

describe("DailyReminderCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDailyReminderStore.setState({ enabled: true });
    useDailyReminderRestoredStore.setState({ restored: true });
  });

  it("is on by default and turns off from the switch", async () => {
    // applyDailyReminder saves the choice once applied; the card shows what it saved.
    jest.mocked(applyDailyReminder).mockImplementation(async (enabled) => {
      useDailyReminderStore.setState({ enabled });
      return enabled ? "scheduled" : "off";
    });
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, On" }));
    await fireEvent(screen.getByLabelText("Remind me daily"), "valueChange", false);

    expect(applyDailyReminder).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Daily reminder, Off" })).toBeTruthy();
  });

  it("stays off and explains when notifications are blocked", async () => {
    useDailyReminderStore.setState({ enabled: false });
    jest.mocked(applyDailyReminder).mockImplementation(async () => {
      useDailyReminderStore.setState({ enabled: false });
      return "denied";
    });
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, Off" }));
    await fireEvent(screen.getByLabelText("Remind me daily"), "valueChange", true);

    expect(useDailyReminderStore.getState().enabled).toBe(false);
    expect(screen.getByRole("alert").props.children).toMatch(/Notifications are turned off/);
    expect(screen.getByRole("button", { name: "Open settings" })).toBeTruthy();
  });

  it("waits for the saved choice before showing or changing it", async () => {
    useDailyReminderRestoredStore.setState({ restored: false });
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, Loading…" }));
    await fireEvent(screen.getByLabelText("Remind me daily"), "valueChange", false);

    expect(applyDailyReminder).not.toHaveBeenCalled();
  });

  it("keeps the previous choice when scheduling fails", async () => {
    jest.mocked(applyDailyReminder).mockRejectedValue(new Error("native failure"));
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, On" }));
    await fireEvent(screen.getByLabelText("Remind me daily"), "valueChange", false);

    expect(useDailyReminderStore.getState().enabled).toBe(true);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
