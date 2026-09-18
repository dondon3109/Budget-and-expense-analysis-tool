import type { VoiceLanguage } from "./types";

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
  shortLabel: string;
  description: string;
}

/** The catalog behind the web settings list and the mobile picker. */
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
