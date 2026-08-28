import { parsePersistedAssistantVoiceOptions, useAssistantVoiceOptionsStore } from "./assistant-voice-store";

describe("assistant voice options persistence", () => {
  it("round-trips the versioned allowlist", () => {
    const parsed = parsePersistedAssistantVoiceOptions({
      subject: "user-a",
      replyMode: "voice",
      voice: "energetic",
    });
    expect(parsed).toEqual({
      subject: "user-a",
      replyMode: "voice",
      voice: "energetic",
    });
  });

  it("migrates legacy autoSend and ignores extra keys", () => {
    const parsed = parsePersistedAssistantVoiceOptions({
      subject: "user-a",
      replyMode: "voice",
      voice: "energetic",
      autoSend: false,
    });
    expect(parsed).toEqual({
      subject: "user-a",
      replyMode: "voice",
      voice: "energetic",
    });
  });

  it("fails closed to defaults for malformed state", () => {
    expect(
      parsePersistedAssistantVoiceOptions({ subject: "user-a", replyMode: "loud" }),
    ).toBe(null);
    expect(parsePersistedAssistantVoiceOptions({ voice: "bright", extra: true })).toBe(null);
    expect(parsePersistedAssistantVoiceOptions("garbage")).toBe(null);
  });

  it("resets every option when the identity changes", () => {
    const store = useAssistantVoiceOptionsStore;
    store.setState({
      subject: "user-a",
      replyMode: "voice",
      voice: "bright",
    });
    store.getState().ensureSubject("user-b");
    const state = store.getState();
    expect(state.subject).toBe("user-b");
    expect(state.replyMode).toBe("text");
    expect(state.voice).toBe("default");
    store.getState().ensureSubject(null);
  });

  it("keeps options when the same identity re-enters", () => {
    const store = useAssistantVoiceOptionsStore;
    store.setState({ subject: "user-b", replyMode: "voice", voice: "bright" });
    store.getState().ensureSubject("user-b");
    expect(store.getState().replyMode).toBe("voice");
    store.getState().ensureSubject(null);
  });
});
