import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

const persistedHideAmountsSchema = z.object({ hidden: z.boolean() }).strict();

const secureHideAmountsStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface HideAmountsState {
  hidden: boolean;
  toggle: () => void;
}

/**
 * Device-local "hide balance" choice for screen sharing and screenshots. It masks displayed
 * amounts only; inputs and stored data are untouched. Not synced, so hiding on one device
 * never hides another.
 */
export const useHideAmountsStore = create<HideAmountsState>()(
  persist(
    (set) => ({
      hidden: false,
      toggle: () => set((state) => ({ hidden: !state.hidden })),
    }),
    {
      name: "zoption-mobile-hide-amounts-v1",
      version: 1,
      storage: createJSONStorage(() => secureHideAmountsStorage),
      partialize: ({ hidden }) => ({ hidden }),
      merge: (persisted, current) => {
        const result = persistedHideAmountsSchema.safeParse(persisted);
        return result.success ? { ...current, hidden: result.data.hidden } : current;
      },
      skipHydration: true,
    },
  ),
);

export function useAmountsHidden(): boolean {
  return useHideAmountsStore((state) => state.hidden);
}
