import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

// The account the last new transaction was saved on. New transactions, receipt
// scans, and mic-widget entries start there. It is a device preference: the sync
// payload never carries it, so each device keeps its own. A saved id that no
// longer matches an active account is ignored by the shared
// preferredTransactionAccount rule, which then picks Cash.
const persistedLastUsedAccountSchema = z
  .object({ accountId: z.string().min(1).max(200).nullable() })
  .strict();

const secureLastUsedAccountStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface LastUsedAccountState {
  accountId: string | null;
  setAccountId: (accountId: string | null) => void;
}

export const useLastUsedAccountStore = create<LastUsedAccountState>()(
  persist(
    (set) => ({
      accountId: null,
      setAccountId: (accountId) => set({ accountId }),
    }),
    {
      // The key of the default spending account this replaced, so an account a
      // user chose there is where their next entry starts.
      name: "zoption-mobile-default-spending-account-v1",
      version: 1,
      storage: createJSONStorage(() => secureLastUsedAccountStorage),
      partialize: ({ accountId }) => ({ accountId }),
      merge: (persisted, current) => {
        const result = persistedLastUsedAccountSchema.safeParse(persisted);
        return result.success ? { ...current, accountId: result.data.accountId } : current;
      },
      skipHydration: true,
    },
  ),
);
