import { fireEvent, render, screen } from "@testing-library/react-native";

import { applyDailyReminder } from "@/features/reminders/daily-reminder";
import { useDailyReminderStore } from "@/stores/daily-reminder-store";
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
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

describe("DailyReminderCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDailyReminderStore.setState({ time: "off" });
  });

  it("is off by default and schedules the chosen time", async () => {
    // applyDailyReminder saves the time once scheduled; the card shows what it saved.
    jest.mocked(applyDailyReminder).mockImplementation(async (time) => {
      useDailyReminderStore.setState({ time });
      return "scheduled";
    });
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, Off" }));
    await fireEvent.press(screen.getByRole("radio", { name: "9:00 PM" }));

    expect(applyDailyReminder).toHaveBeenCalledWith("21:00");
    expect(useDailyReminderStore.getState().time).toBe("21:00");
    expect(screen.getByRole("button", { name: "Daily reminder, 9:00 PM" })).toBeTruthy();
  });

  it("stays off and explains when notifications are blocked", async () => {
    jest.mocked(applyDailyReminder).mockImplementation(async () => {
      useDailyReminderStore.setState({ time: "off" });
      return "denied";
    });
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, Off" }));
    await fireEvent.press(screen.getByRole("radio", { name: "8:00 AM" }));

    expect(useDailyReminderStore.getState().time).toBe("off");
    expect(screen.getByRole("alert").props.children).toMatch(/Notifications are turned off/);
    expect(screen.getByRole("button", { name: "Open settings" })).toBeTruthy();
  });

  it("keeps the previous time when scheduling fails", async () => {
    useDailyReminderStore.setState({ time: "12:00" });
    jest.mocked(applyDailyReminder).mockRejectedValue(new Error("native failure"));
    await render(<DailyReminderCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Daily reminder, 12:00 PM" }));
    await fireEvent.press(screen.getByRole("radio", { name: "6:00 PM" }));

    expect(useDailyReminderStore.getState().time).toBe("12:00");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
