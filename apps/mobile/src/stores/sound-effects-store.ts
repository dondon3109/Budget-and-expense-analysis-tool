import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

const persistedSoundSchema = z
  .object({
    state: z.object({ enabled: z.boolean() }).strict(),
    version: z.literal(1),
  })
  .strict();

const secureSoundStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface SoundEffectsState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Device-local on/off choice for the tap, success, and error sounds. On by default. */
export const useSoundEffectsStore = create<SoundEffectsState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "zoption-mobile-sound-effects-v1",
      version: 1,
      storage: createJSONStorage(() => secureSoundStorage),
      partialize: ({ enabled }) => ({ enabled }),
      merge: (persisted, current) => {
        const result = persistedSoundSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, enabled: result.data.state.enabled } : current;
      },
      skipHydration: true,
    },
  ),
);
