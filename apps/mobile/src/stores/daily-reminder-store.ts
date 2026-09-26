import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

/** Local time of day for the daily reminder, or "off". Reminders are opt-in. */
export const DAILY_REMINDER_TIMES = ["off", "08:00", "12:00", "18:00", "21:00"] as const;

export type DailyReminderTime = (typeof DAILY_REMINDER_TIMES)[number];

const dailyReminderTimeSchema = z.enum(DAILY_REMINDER_TIMES);

const persistedDailyReminderSchema = z
  .object({
    state: z.object({ time: dailyReminderTimeSchema }).strict(),
    version: z.literal(1),
  })
  .strict();

const secureDailyReminderStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface DailyReminderState {
  time: DailyReminderTime;
  setTime: (time: DailyReminderTime) => void;
}

/**
 * Remembers the chosen reminder time so the settings card can show it. The
 * OS owns the schedule itself: a scheduled daily notification survives app
 * restarts, and expo-notifications reschedules it after a reboot.
 */
export const useDailyReminderStore = create<DailyReminderState>()(
  persist(
    (set) => ({
      time: "off",
      setTime: (time) => set({ time }),
    }),
    {
      name: "zoption-mobile-daily-reminder-v1",
      version: 1,
      storage: createJSONStorage(() => secureDailyReminderStorage),
      partialize: ({ time }) => ({ time }),
      merge: (persisted, current) => {
        const result = persistedDailyReminderSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, time: result.data.state.time } : current;
      },
      skipHydration: true,
    },
  ),
);
