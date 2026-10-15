import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

const persistedReduceMotionSchema = z
  .object({
    state: z.object({ enabled: z.boolean() }).strict(),
    version: z.literal(1),
  })
  .strict();

const secureReduceMotionStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface ReduceMotionState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/**
 * Device-local in-app Reduce Motion choice. Off by default; it only ever adds to the system
 * setting (see `useReduceMotion`), never turns motion back on.
 */
export const useReduceMotionStore = create<ReduceMotionState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "zoption-mobile-reduce-motion-v1",
      version: 1,
      storage: createJSONStorage(() => secureReduceMotionStorage),
      partialize: ({ enabled }) => ({ enabled }),
      merge: (persisted, current) => {
        const result = persistedReduceMotionSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, enabled: result.data.state.enabled } : current;
      },
      skipHydration: true,
    },
  ),
);
