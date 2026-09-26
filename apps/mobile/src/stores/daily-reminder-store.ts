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
  /** Not persisted: false until this session's restore has loaded the saved time. */
  restored: boolean;
  setTime: (time: DailyReminderTime) => void;
}

/**
 * The chosen reminder time, shown by the settings card. Written only by
 * features/reminders/daily-reminder.ts once the OS schedule matches it; the
 * schedule itself survives app restarts and reboots, and the launch restore
 * re-applies the saved time.
 */
export const useDailyReminderStore = create<DailyReminderState>()(
  persist(
    (set) => ({
      time: "off",
      restored: false,
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
