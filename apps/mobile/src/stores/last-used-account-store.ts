import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

// The account a new transaction, receipt, or mic-widget entry starts on. Like the
// voice language it is a device preference: the sync payload never carries it,
// so installed apps keep their strict pull contract and each device keeps its
// own choice. A saved id that no longer matches an active account is ignored by
// the shared preferredTransactionAccount rule.
const persistedDefaultSpendingAccountSchema = z
  .object({ accountId: z.string().min(1).max(200).nullable() })
  .strict();

const secureDefaultSpendingAccountStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface DefaultSpendingAccountState {
  accountId: string | null;
  setAccountId: (accountId: string | null) => void;
}

export const useDefaultSpendingAccountStore = create<DefaultSpendingAccountState>()(
  persist(
    (set) => ({
      accountId: null,
      setAccountId: (accountId) => set({ accountId }),
    }),
    {
      name: "zoption-mobile-default-spending-account-v1",
      version: 1,
      storage: createJSONStorage(() => secureDefaultSpendingAccountStorage),
      partialize: ({ accountId }) => ({ accountId }),
      merge: (persisted, current) => {
        const result = persistedDefaultSpendingAccountSchema.safeParse(persisted);
        return result.success ? { ...current, accountId: result.data.accountId } : current;
      },
      skipHydration: true,
    },
  ),
);
