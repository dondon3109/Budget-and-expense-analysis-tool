import {
  parsePersistedVoiceLanguage,
  useVoiceLanguageStore,
  VOICE_LANGUAGES,
} from "./voice-language-store";

describe("voice language store and persistence", () => {
  beforeEach(() => {
    useVoiceLanguageStore.setState({ language: "auto" });
  });

  it("defaults to Auto mode (bilingual English and Tagalog)", () => {
    expect(useVoiceLanguageStore.getState().language).toBe("auto");
  });

  it("accepts valid persisted language choices", () => {
    expect(parsePersistedVoiceLanguage({ state: { language: "auto" }, version: 1 })).toBe("auto");
    expect(parsePersistedVoiceLanguage({ state: { language: "en" }, version: 1 })).toBe("en");
    expect(parsePersistedVoiceLanguage({ state: { language: "fil" }, version: 1 })).toBe("fil");
  });

  it("fails closed to auto for unknown or malformed state", () => {
    expect(parsePersistedVoiceLanguage({ state: { language: "es" }, version: 1 })).toBe("auto");
    expect(parsePersistedVoiceLanguage({ state: { language: "auto", extra: true }, version: 1 })).toBe(
      "auto",
    );
    expect(parsePersistedVoiceLanguage(null)).toBe("auto");
    expect(parsePersistedVoiceLanguage(undefined)).toBe("auto");
    expect(parsePersistedVoiceLanguage("auto")).toBe("auto");
  });

  it("updates language and cycles correctly", () => {
    const store = useVoiceLanguageStore.getState();
    store.setLanguage("en");
    expect(useVoiceLanguageStore.getState().language).toBe("en");

    expect(useVoiceLanguageStore.getState().cycleLanguage()).toBe("fil");
    expect(useVoiceLanguageStore.getState().language).toBe("fil");

    expect(useVoiceLanguageStore.getState().cycleLanguage()).toBe("auto");
    expect(useVoiceLanguageStore.getState().language).toBe("auto");

    expect(useVoiceLanguageStore.getState().cycleLanguage()).toBe("en");
    expect(useVoiceLanguageStore.getState().language).toBe("en");
  });

  it("defines Auto, English, and Tagalog language options", () => {
    expect(VOICE_LANGUAGES.map((opt) => opt.code)).toEqual(["auto", "en", "fil"]);
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "auto")?.shortLabel).toBe("AUTO");
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "en")?.shortLabel).toBe("EN");
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "fil")?.shortLabel).toBe("TL");
  });
});
