import { create } from "zustand";

import type { AccountFeature } from "./account-features";

interface AccountPromptState {
  feature: AccountFeature | null;
  open: (feature: AccountFeature) => void;
  close: () => void;
}

export const useAccountPromptStore = create<AccountPromptState>((set) => ({
  feature: null,
  open: (feature) => set({ feature }),
  close: () => set({ feature: null }),
}));
