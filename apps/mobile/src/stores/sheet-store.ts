import { create } from "zustand";

export type SheetName = "transaction-filters" | "theme-picker" | null;

interface SheetState {
  openSheet: SheetName;
  open: (sheet: Exclude<SheetName, null>) => void;
  close: () => void;
}

export const useSheetStore = create<SheetState>((set) => ({
  openSheet: null,
  open: (openSheet) => set({ openSheet }),
  close: () => set({ openSheet: null }),
}));
