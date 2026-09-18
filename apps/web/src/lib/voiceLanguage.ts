import type { VoiceLanguage } from "@zoption/shared";

export type { VoiceLanguage, VoiceLanguageOption } from "@zoption/shared";
export { VOICE_LANGUAGES } from "@zoption/shared";

export const VOICE_LANGUAGE_STORAGE_KEY = "zoption_voice_language";

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
 * When in "auto" mode, detects whether the browser locale is Filipino/Tagalog before falling back to en-US.
 */
export function speechRecognitionLang(lang: VoiceLanguage): string {
  if (lang === "fil") return "fil-PH";
  if (lang === "en") return "en-US";
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith("fil") || nav.startsWith("tl")) {
      return "fil-PH";
    }
  }
  return "en-US";
}

// Synchronize voice language across browser tabs when localStorage changes elsewhere.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === VOICE_LANGUAGE_STORAGE_KEY) {
      const val = event.newValue;
      const lang: VoiceLanguage = val === "en" || val === "fil" || val === "auto" ? val : "auto";
      window.dispatchEvent(new CustomEvent("zoption-voice-lang-change", { detail: lang }));
    }
  });
}
