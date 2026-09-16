import type { VoiceLanguage } from "@zoption/shared";
export type { VoiceLanguage };

export const VOICE_LANGUAGE_STORAGE_KEY = "zoption_voice_language";

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
  speechRecognitionLang: string;
  description: string;
}

export const VOICE_LANGUAGES: readonly VoiceLanguageOption[] = [
  {
    code: "auto",
    label: "Auto",
    nativeLabel: "Auto (EN / TL)",
    speechRecognitionLang: "en-US",
    description: "Automatically detects whether you are speaking English or Tagalog/Filipino.",
  },
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    speechRecognitionLang: "en-US",
    description: "Optimized for English voice input and financial terminology.",
  },
  {
    code: "fil",
    label: "Tagalog",
    nativeLabel: "Tagalog",
    speechRecognitionLang: "fil-PH",
    description: "Optimized for Tagalog, Filipino, and Taglish expressions.",
  },
] as const;

/**
 * Retrieves the user's preferred voice input language from localStorage.
 * Defaults to "auto" (bilingual auto-detect for English and Tagalog).
 */
export function getStoredVoiceLanguage(): VoiceLanguage {
  if (typeof window === "undefined" || !window.localStorage) return "auto";
  const stored = window.localStorage.getItem(VOICE_LANGUAGE_STORAGE_KEY);
  if (stored === "auto" || stored === "en" || stored === "fil") return stored;
  return "auto";
}

/**
 * Persists the user's preferred voice input language.
 */
export function setStoredVoiceLanguage(lang: VoiceLanguage): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, lang);
    window.dispatchEvent(new CustomEvent("zoption-voice-lang-change", { detail: lang }));
  } catch {
    // Ignore quota or private browsing storage failures
  }
}

/**
 * Maps the voice language to a BCP-47 tag accepted by browser SpeechRecognition engines.
 */
export function speechRecognitionLang(lang: VoiceLanguage): string {
  return lang === "fil" ? "fil-PH" : "en-US";
}
