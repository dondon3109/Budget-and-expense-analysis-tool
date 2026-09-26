import { useDailyReminderStore } from "./daily-reminder-store";

const DAILY_REMINDER_STORAGE_KEY = "zoption-mobile-daily-reminder-v1";

// SecureStore has no native module under jest, so persistence runs against an
// in-memory map with the same shape.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };

describe("daily reminder store", () => {
  beforeEach(() => {
    secureStore.__store.clear();
    useDailyReminderStore.setState({ time: "off" });
  });

  it("is off by default", () => {
    expect(useDailyReminderStore.getState().time).toBe("off");
  });

  it("writes the chosen time and reads it back after a relaunch", async () => {
    useDailyReminderStore.getState().setTime("18:00");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = secureStore.__store.get(DAILY_REMINDER_STORAGE_KEY);
    expect(saved).toContain("18:00");

    // Every setState writes through, so put the saved value back before rehydrating.
    useDailyReminderStore.setState({ time: "off" });
    secureStore.__store.set(DAILY_REMINDER_STORAGE_KEY, saved ?? "");

    await useDailyReminderStore.persist.rehydrate();

    expect(useDailyReminderStore.getState().time).toBe("18:00");
  });

  it.each([
    ["not json", "not json"],
    ["an unknown time", JSON.stringify({ state: { time: "07:30" }, version: 1 })],
    ["an extra field", JSON.stringify({ state: { time: "08:00", extra: true }, version: 1 })],
  ])("falls back to off when the saved state is %s", async (_label, raw) => {
    secureStore.__store.set(DAILY_REMINDER_STORAGE_KEY, raw);

    await useDailyReminderStore.persist.rehydrate();

    expect(useDailyReminderStore.getState().time).toBe("off");
  });
});
