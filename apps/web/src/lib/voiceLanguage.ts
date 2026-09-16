import type { VoiceLanguage } from "@zoption/shared";
export type { VoiceLanguage };

export const VOICE_LANGUAGE_STORAGE_KEY = "zoption_voice_language";

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
  speechRecognitionLang: string;
}

export const VOICE_LANGUAGES: readonly VoiceLanguageOption[] = [
  {
    code: "fil",
    label: "Tagalog",
    nativeLabel: "Tagalog",
    speechRecognitionLang: "fil-PH",
  },
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    speechRecognitionLang: "en-US",
  },
] as const;

/**
 * Retrieves the user's preferred voice input language from localStorage.
 * Defaults to "fil" (Tagalog) since Zoption is tailored for the Philippines.
 */
export function getStoredVoiceLanguage(): VoiceLanguage {
  if (typeof window === "undefined" || !window.localStorage) return "fil";
  const stored = window.localStorage.getItem(VOICE_LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "fil") return stored;
  return "fil";
}

/**
 * Persists the user's preferred voice input language.
 */
export function setStoredVoiceLanguage(lang: VoiceLanguage): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, lang);
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
