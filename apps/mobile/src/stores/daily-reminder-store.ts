import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

const persistedDailyReminderSchema = z
  .object({
    state: z.object({ enabled: z.boolean() }).strict(),
    version: z.literal(1),
  })
  .strict();

const secureDailyReminderStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface DailyReminderState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/**
 * Whether the daily reminders are on, shown by the settings card. On by
 * default. Written only by features/reminders/daily-reminder.ts once the OS
 * schedule matches it; the schedule itself survives app restarts and reboots,
 * and the launch restore re-applies the saved choice.
 */
export const useDailyReminderStore = create<DailyReminderState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "zoption-mobile-daily-reminder-v1",
      version: 1,
      storage: createJSONStorage(() => secureDailyReminderStorage),
      partialize: ({ enabled }) => ({ enabled }),
      merge: (persisted, current) => {
        const result = persistedDailyReminderSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, enabled: result.data.state.enabled } : current;
      },
      skipHydration: true,
    },
  ),
);

/**
 * False until this session's restore has loaded the saved time. A separate,
 * unpersisted store on purpose: persist writes the store to SecureStore on every
 * setState, even before hydration, so flipping a flag on the persisted store at
 * launch would overwrite the saved time with the in-memory default.
 */
export const useDailyReminderRestoredStore = create<{ restored: boolean }>()(() => ({
  restored: false,
}));
