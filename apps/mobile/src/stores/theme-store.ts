import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

import type { ThemePreference } from "@/ui/tokens";

const themePreferenceSchema = z.enum(["system", "light", "dark", "coffee"]);
const persistedThemeSchema = z
  .object({
    state: z.object({ preference: themePreferenceSchema }).strict(),
    version: z.literal(1),
  })
  .strict();

export function parsePersistedTheme(value: unknown): ThemePreference {
  const parsed = persistedThemeSchema.safeParse(value);
  return parsed.success ? parsed.data.state.preference : "system";
}

const secureThemeStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "zoption-mobile-theme-v1",
      version: 1,
      storage: createJSONStorage(() => secureThemeStorage),
      partialize: ({ preference }) => ({ preference }),
      merge: (persisted, current) => {
        const result = persistedThemeSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, preference: result.data.state.preference } : current;
      },
      skipHydration: true,
    },
  ),
);
