import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

const persistedOnTrackSchema = z.object({ dismissed: z.boolean() }).strict();

const secureOnTrackStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface ForecastOnTrackState {
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * Device-local choice to close the cash flow forecast's "On track" status. Only the good-news
 * status can be closed; a buffer warning or deficit risk always shows.
 */
export const useForecastOnTrackStore = create<ForecastOnTrackState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
    }),
    {
      name: "zoption-mobile-forecast-on-track-v1",
      version: 1,
      storage: createJSONStorage(() => secureOnTrackStorage),
      partialize: ({ dismissed }) => ({ dismissed }),
      merge: (persisted, current) => {
        const result = persistedOnTrackSchema.safeParse(persisted);
        return result.success ? { ...current, dismissed: result.data.dismissed } : current;
      },
      skipHydration: true,
    },
  ),
);
