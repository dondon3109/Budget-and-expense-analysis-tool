import {
  parsePersistedVoiceLanguage,
  useVoiceLanguageStore,
  VOICE_LANGUAGES,
} from "./voice-language-store";

const VOICE_LANGUAGE_STORAGE_KEY = "zoption-mobile-voice-language-v1";

// The store persists through SecureStore, which has no native module under jest,
// so the round trip below runs against an in-memory map with the same shape.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };

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

  it("writes the choice and reads it back after a relaunch", async () => {
    useVoiceLanguageStore.getState().setLanguage("fil");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = secureStore.__store.get(VOICE_LANGUAGE_STORAGE_KEY);
    expect(saved).toContain("fil");

    // Simulate a relaunch: every setState writes through, so the in memory value
    // is put back to the stored one only by rehydration.
    useVoiceLanguageStore.setState({ language: "auto" });
    secureStore.__store.set(VOICE_LANGUAGE_STORAGE_KEY, saved ?? "");

    await useVoiceLanguageStore.persist.rehydrate();

    expect(useVoiceLanguageStore.getState().language).toBe("fil");
  });

  it("keeps the default when the saved state is malformed", async () => {
    secureStore.__store.set(VOICE_LANGUAGE_STORAGE_KEY, "not json");

    await useVoiceLanguageStore.persist.rehydrate();

    expect(useVoiceLanguageStore.getState().language).toBe("auto");
  });

  it("defines Auto, English, and Tagalog language options", () => {
    expect(VOICE_LANGUAGES.map((opt) => opt.code)).toEqual(["auto", "en", "fil"]);
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "auto")?.shortLabel).toBe("AUTO");
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "en")?.shortLabel).toBe("EN");
    expect(VOICE_LANGUAGES.find((opt) => opt.code === "fil")?.shortLabel).toBe("TL");
  });
});
