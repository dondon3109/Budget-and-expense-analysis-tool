import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import type { VoiceLanguage } from "@zoption/shared";

export type { VoiceLanguage };

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
  shortLabel: string;
  description: string;
}

export const VOICE_LANGUAGES: readonly VoiceLanguageOption[] = [
  {
    code: "auto",
    label: "Auto",
    nativeLabel: "Auto (EN / TL)",
    shortLabel: "AUTO",
    description: "Automatically detects whether you are speaking English or Tagalog/Filipino.",
  },
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    shortLabel: "EN",
    description: "Optimized for English voice input and financial terminology.",
  },
  {
    code: "fil",
    label: "Tagalog",
    nativeLabel: "Tagalog",
    shortLabel: "TL",
    description: "Optimized for Tagalog, Filipino, and Taglish expressions.",
  },
] as const;

const voiceLanguageSchema = z.enum(["auto", "en", "fil"]);

const persistedVoiceLanguageSchema = z
  .object({
    state: z.object({ language: voiceLanguageSchema }).strict(),
    version: z.literal(1),
  })
  .strict();

export function parsePersistedVoiceLanguage(value: unknown): VoiceLanguage {
  const parsed = persistedVoiceLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data.state.language : "auto";
}

const secureVoiceLanguageStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface VoiceLanguageState {
  language: VoiceLanguage;
  setLanguage: (language: VoiceLanguage) => void;
  cycleLanguage: () => VoiceLanguage;
}

export const useVoiceLanguageStore = create<VoiceLanguageState>()(
  persist(
    (set, get) => ({
      language: "auto",
      setLanguage: (language) => set({ language }),
      cycleLanguage: () => {
        const current = get().language;
        const next: VoiceLanguage = current === "auto" ? "en" : current === "en" ? "fil" : "auto";
        set({ language: next });
        return next;
      },
    }),
    {
      name: "zoption-mobile-voice-language-v1",
      version: 1,
      storage: createJSONStorage(() => secureVoiceLanguageStorage),
      partialize: ({ language }) => ({ language }),
      merge: (persisted, current) => {
        const result = persistedVoiceLanguageSchema.safeParse({ state: persisted, version: 1 });
        return result.success ? { ...current, language: result.data.state.language } : current;
      },
      skipHydration: true,
    },
  ),
);
