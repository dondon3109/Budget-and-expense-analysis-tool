// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStoredVoiceLanguage,
  setStoredVoiceLanguage,
  speechRecognitionLang,
  VOICE_LANGUAGE_STORAGE_KEY,
  VOICE_LANGUAGES,
} from "../src/lib/voiceLanguage";

describe("voiceLanguage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("getStoredVoiceLanguage", () => {
    it("returns 'auto' by default when no preference is stored", () => {
      expect(getStoredVoiceLanguage()).toBe("auto");
    });

    it("returns 'auto' when an unrecognized value is stored", () => {
      window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "es");
      expect(getStoredVoiceLanguage()).toBe("auto");

      window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "invalid");
      expect(getStoredVoiceLanguage()).toBe("auto");
    });

    it("returns 'en' when English preference is stored", () => {
      window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "en");
      expect(getStoredVoiceLanguage()).toBe("en");
    });

    it("returns 'fil' when Tagalog preference is stored", () => {
      window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "fil");
      expect(getStoredVoiceLanguage()).toBe("fil");
    });

    it("returns 'auto' when auto preference is stored explicitly", () => {
      window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "auto");
      expect(getStoredVoiceLanguage()).toBe("auto");
    });
  });

  describe("setStoredVoiceLanguage", () => {
    it("persists language to localStorage and dispatches zoption-voice-lang-change event", () => {
      const listener = vi.fn();
      window.addEventListener("zoption-voice-lang-change", listener);

      setStoredVoiceLanguage("fil");
      expect(window.localStorage.getItem(VOICE_LANGUAGE_STORAGE_KEY)).toBe("fil");
      expect(listener).toHaveBeenCalledOnce();
      expect((listener.mock.calls[0]?.[0] as CustomEvent<string>)?.detail).toBe("fil");

      setStoredVoiceLanguage("auto");
      expect(window.localStorage.getItem(VOICE_LANGUAGE_STORAGE_KEY)).toBe("auto");
      expect(listener).toHaveBeenCalledTimes(2);
      expect((listener.mock.calls[1]?.[0] as CustomEvent<string>)?.detail).toBe("auto");

      window.removeEventListener("zoption-voice-lang-change", listener);
    });
  });

  describe("cross-tab storage event synchronization", () => {
    it("dispatches zoption-voice-lang-change event when storage changes in another tab", () => {
      const listener = vi.fn();
      window.addEventListener("zoption-voice-lang-change", listener);

      // Simulate a storage event from another browser tab
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VOICE_LANGUAGE_STORAGE_KEY,
          newValue: "fil",
        }),
      );

      expect(listener).toHaveBeenCalledOnce();
      expect((listener.mock.calls[0]?.[0] as CustomEvent<string>)?.detail).toBe("fil");

      // Simulate switching back to English from another tab
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VOICE_LANGUAGE_STORAGE_KEY,
          newValue: "en",
        }),
      );

      expect(listener).toHaveBeenCalledTimes(2);
      expect((listener.mock.calls[1]?.[0] as CustomEvent<string>)?.detail).toBe("en");

      // Simulate clearing preference from another tab -> defaults to "auto"
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VOICE_LANGUAGE_STORAGE_KEY,
          newValue: null,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(3);
      expect((listener.mock.calls[2]?.[0] as CustomEvent<string>)?.detail).toBe("auto");

      window.removeEventListener("zoption-voice-lang-change", listener);
    });

    it("ignores storage events for unrelated keys", () => {
      const listener = vi.fn();
      window.addEventListener("zoption-voice-lang-change", listener);

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "zoption_theme",
          newValue: "dark",
        }),
      );

      expect(listener).not.toHaveBeenCalled();
      window.removeEventListener("zoption-voice-lang-change", listener);
    });
  });

  describe("speechRecognitionLang", () => {
    it("returns 'fil-PH' when language is 'fil'", () => {
      expect(speechRecognitionLang("fil")).toBe("fil-PH");
    });

    it("returns 'en-US' when language is 'en'", () => {
      expect(speechRecognitionLang("en")).toBe("en-US");
    });

    it("returns 'en-US' when language is 'auto' and navigator is English", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
      expect(speechRecognitionLang("auto")).toBe("en-US");
    });

    it("returns 'fil-PH' when language is 'auto' and navigator is Filipino/Tagalog", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("fil-PH");
      expect(speechRecognitionLang("auto")).toBe("fil-PH");

      vi.spyOn(navigator, "language", "get").mockReturnValue("tl-PH");
      expect(speechRecognitionLang("auto")).toBe("fil-PH");
    });
  });

  describe("VOICE_LANGUAGES", () => {
    it("includes Auto as the first option with default badge metadata", () => {
      expect(VOICE_LANGUAGES[0]).toMatchObject({
        code: "auto",
        label: "Auto",
      });
      expect(VOICE_LANGUAGES).toHaveLength(3);
      expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual(["auto", "en", "fil"]);
    });
  });
});
