import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

import { currencies, type Currency } from "@zoption/shared";

// The last workspace currency the Worker confirmed. The Worker owns the setting;
// this is only a cache so the first frame after launch and offline use label
// amounts the way the last online session did. Anything unreadable falls back to PHP.
const persistedWorkspaceCurrencySchema = z.object({ currency: z.enum(currencies) }).strict();

const secureWorkspaceCurrencyStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface WorkspaceCurrencyState {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

export const useWorkspaceCurrencyStore = create<WorkspaceCurrencyState>()(
  persist(
    (set) => ({
      currency: "PHP",
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: "zoption-mobile-workspace-currency-v1",
      version: 1,
      storage: createJSONStorage(() => secureWorkspaceCurrencyStorage),
      partialize: ({ currency }) => ({ currency }),
      merge: (persisted, current) => {
        const result = persistedWorkspaceCurrencySchema.safeParse(persisted);
        return result.success ? { ...current, currency: result.data.currency } : current;
      },
      skipHydration: true,
    },
  ),
);

export function useWorkspaceCurrency(): Currency {
  return useWorkspaceCurrencyStore((state) => state.currency);
}
