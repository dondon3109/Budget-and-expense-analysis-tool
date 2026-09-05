import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// NOTE: drive async hook callbacks directly and assert with findBy/waitFor.
// Wrapping these multi-hop async flows in manual act() breaks subsequent
// renders in this suite (later tests mount empty trees).

import {
  VOICE_CONVERSATION_SPEECH_VOICE,
  AssistantVoiceConversation,
} from "./AssistantVoiceConversation";

jest.mock("./assistant-voice-hooks", () => ({
  useAssistantRecorder: jest.fn(),
  useSpokenReplies: jest.fn(),
}));

jest.mock("@/api/assistant", () => ({
  createAssistantThreadTurn: jest.fn(),
  sendAssistantTurn: jest.fn(),
}));

jest.mock("@/api/assistant-voice", () => ({
  getAssistantVoicePreferences: jest.fn(),
  grantAssistantVoiceConsent: jest.fn(),
}));

interface HookMocks {
  useAssistantRecorder: jest.Mock;
  useSpokenReplies: jest.Mock;
  createAssistantThreadTurn: jest.Mock;
  sendAssistantTurn: jest.Mock;
  getAssistantVoicePreferences: jest.Mock;
  grantAssistantVoiceConsent: jest.Mock;
}

function mocks(): HookMocks {
  const hooks = jest.requireMock("./assistant-voice-hooks") as Pick<
    HookMocks,
    "useAssistantRecorder" | "useSpokenReplies"
  >;
  const api = jest.requireMock("@/api/assistant") as Pick<
    HookMocks,
    "createAssistantThreadTurn" | "sendAssistantTurn"
  >;
  const voiceApi = jest.requireMock("@/api/assistant-voice") as Pick<
    HookMocks,
    "getAssistantVoicePreferences" | "grantAssistantVoiceConsent"
  >;
  return {
    useAssistantRecorder: hooks.useAssistantRecorder,
    useSpokenReplies: hooks.useSpokenReplies,
    createAssistantThreadTurn: api.createAssistantThreadTurn,
    sendAssistantTurn: api.sendAssistantTurn,
    getAssistantVoicePreferences: voiceApi.getAssistantVoicePreferences,
    grantAssistantVoiceConsent: voiceApi.grantAssistantVoiceConsent,
  };
}

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const ASSISTANT_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

function consentedPreferences(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    speechAvailable: true,
    reviewRequired: false,
    consentedAt: "2026-08-12T10:00:00.000Z",
    consentVersion: 3,
    transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
    ttsModel: "s2.1-pro-free",
    ...overrides,
  };
}

function turnResult() {
  return {
    thread: {
      id: THREAD_ID,
      title: "How much did I spend?",
      kind: "voice",
      lastMessageAt: "2026-08-12T10:00:01.000Z",
      createdAt: "2026-08-12T10:00:00.000Z",
    },
    userMessage: {
      id: "22222222-2222-4222-8222-222222222222",
      threadId: THREAD_ID,
      role: "user",
      content: "How much did I spend?",
      status: "completed",
      createdAt: "2026-08-12T10:00:00.000Z",
    },
    assistantMessage: {
      id: ASSISTANT_MESSAGE_ID,
      threadId: THREAD_ID,
      role: "assistant",
      content: "You spent PHP 1,250 this month.",
      status: "completed",
      createdAt: "2026-08-12T10:00:01.000Z",
    },
  };
}

const baseProps = {
  getAccessToken: async () => "token",
  withToken: async <T,>(operation: (token: string) => Promise<T>) => operation("token"),
  assistantName: "Aster",
  onClose: jest.fn(),
  onTurnComplete: jest.fn(),
};

function installHookMocks() {
  const m = mocks();
  const recorder = {
    phase: "idle",
    liveStatus: "idle",
    startRecording: jest.fn(),
    stopAndTranscribe: jest.fn(),
    cancelRecording: jest.fn(),
  };
  const captured: {
    transcript: ((text: string) => void) | null;
    partial: ((text: string) => void) | null;
    speechError: ((error: { message: string }) => void) | null;
    ended: (() => void) | null;
  } = { transcript: null, partial: null, speechError: null, ended: null };
  m.useAssistantRecorder.mockImplementation((options: any) => {
    captured.transcript = options.onTranscribed;
    captured.partial = options.onPartialTranscript ?? null;
    return recorder;
  });
  const spoken = {
    playingMessageId: null as string | null,
    listen: jest.fn(),
    speechProgress: null as { currentTime: number; duration: number; playing: boolean } | null,
  };
  spoken.listen.mockResolvedValue(undefined);
  m.useSpokenReplies.mockImplementation((options: any) => {
    captured.speechError = options.onError;
    captured.ended = options.onEnded ?? null;
    return spoken;
  });
  return { recorder, spoken, captured };
}

beforeEach(() => {
  jest.clearAllMocks();
  const m = mocks();
  m.getAssistantVoicePreferences.mockResolvedValue(consentedPreferences());
  m.grantAssistantVoiceConsent.mockResolvedValue(consentedPreferences());
  m.createAssistantThreadTurn.mockResolvedValue(turnResult());
  m.sendAssistantTurn.mockResolvedValue(turnResult());
});

// Advances the mocked recorder lifecycle the way the native module would:
// mutate phase, re-render, and let the screen status follow.
function setRecorderPhase(
  rerender: (ui: any) => void,
  recorder: { phase: string },
  phase: string,
  ui: any,
) {
  recorder.phase = phase;
  mocks().useAssistantRecorder.mockReturnValue({ ...(recorder as any) });
  rerender(ui);
}

describe("AssistantVoiceConversation", () => {
  it("uses Bright Female with no voice picker", () => {
    expect(VOICE_CONVERSATION_SPEECH_VOICE).toBe("bright");
  });

  it("requires voice consent before the microphone is requested", async () => {
    const m = mocks();
    m.getAssistantVoicePreferences.mockResolvedValue({
      ...consentedPreferences(),
      consentedAt: null,
      consentVersion: 0,
    });
    const { recorder } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByText("Talk to Aster?")).toBeTruthy();
    expect(recorder.startRecording).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Accept and continue"));
    await waitFor(() => expect(m.grantAssistantVoiceConsent).toHaveBeenCalledTimes(1));
    // Consent warms the mic automatically — no second tap needed.
    await waitFor(() => expect(recorder.startRecording).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Please wait…")).toBeTruthy();
  });

  it("auto-listens on open and speaks the reply with Bright Female only", async () => {
    const m = mocks();
    const { recorder, spoken, captured } = installHookMocks();
    const props = { ...baseProps, onTurnComplete: jest.fn() };
    const { rerender } = await render(<AssistantVoiceConversation {...props} />);

    // Hands-free open: warming starts without a tap, and the UI waits for capture.
    await waitFor(() => expect(recorder.startRecording).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    // The recorder reports capturing — only now is the user told to speak.
    setRecorderPhase(rerender, recorder, "recording", <AssistantVoiceConversation {...props} />);
    expect(await screen.findByText("You can now speak")).toBeTruthy();
    expect(await screen.findByLabelText("Stop listening")).toBeTruthy();

    await captured.partial?.("How much did I");
    expect(await screen.findByText("How much did I", { exact: false })).toBeTruthy();
    expect(screen.getByLabelText("Conversation captions")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");

    await waitFor(() =>
      expect(m.createAssistantThreadTurn).toHaveBeenCalledWith(
        { accessToken: "token" },
        expect.objectContaining({ message: "How much did I spend?", kind: "voice" }),
      ),
    );
    await waitFor(() => expect(spoken.listen).toHaveBeenCalledWith(ASSISTANT_MESSAGE_ID, "bright"));
    expect(spoken.listen).toHaveBeenCalledTimes(1);
    expect(props.onTurnComplete).toHaveBeenCalledWith(expect.objectContaining({ id: THREAD_ID }));

    // The reply types out while speaking; allow the fallback pace to finish.
    expect(await screen.findByText("Speaking…")).toBeTruthy();
    expect(
      await screen.findByText("You spent PHP 1,250 this month.", {}, { timeout: 4000 }),
    ).toBeTruthy();

    captured.ended?.();
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
  });

  it("types the reply while speaking and snaps to full text when speech ends", async () => {
    const { spoken, captured } = installHookMocks();
    // Halfway through the audio: the paced branch must show the first half.
    spoken.speechProgress = { currentTime: 5, duration: 10, playing: true };
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");
    expect(await screen.findByText("Speaking…")).toBeTruthy();

    // Paced to 50% of the audio (31 chars): 16-char prefix with caret, never the full text.
    expect(await screen.findByText(/You spent PHP 1,/)).toBeTruthy();
    expect(screen.queryByText("You spent PHP 1,250 this month.", { exact: true })).toBeNull();

    captured.ended?.();
    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeTruthy();
    expect(screen.queryByText("▍", { exact: false })).toBeNull();
  });

  it("holds the caption at the caret until audio is audible", async () => {
    const { spoken, captured } = installHookMocks();
    // Audio known but not playing yet (still loading): no letters may outrun the voice.
    spoken.speechProgress = { currentTime: 0, duration: 10, playing: false };
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");
    expect(await screen.findByText("Speaking…")).toBeTruthy();

    expect(screen.getByText("▍")).toBeTruthy();
    expect(screen.queryByText(/You spent PHP/)).toBeNull();

    captured.ended?.();
    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeTruthy();
  });

  it("says live preview is off while listening without a live session", async () => {
    const { recorder } = installHookMocks();
    recorder.liveStatus = "unavailable";
    const props = { ...baseProps };
    const { rerender } = await render(<AssistantVoiceConversation {...props} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    setRecorderPhase(rerender, recorder, "recording", <AssistantVoiceConversation {...props} />);

    expect(await screen.findByText("Live preview is off here", { exact: false })).toBeTruthy();
  });

  it("still shows the reply text when speech synthesis fails", async () => {
    const m = mocks();
    const { captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");
    await waitFor(() => expect(m.createAssistantThreadTurn).toHaveBeenCalled());

    captured.speechError?.({ message: "The spoken reply failed. Try again." });
    expect(
      await screen.findByText("You spent PHP 1,250 this month.", {}, { timeout: 4000 }),
    ).toBeTruthy();
    expect(await screen.findByText("The spoken reply failed. Try again.")).toBeTruthy();
  });

  it("shows text with an unavailable notice when speech is not configured", async () => {
    const m = mocks();
    m.getAssistantVoicePreferences.mockResolvedValue(
      consentedPreferences({ speechAvailable: false }),
    );
    const { spoken, captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");

    await waitFor(() =>
      expect(
        screen.getByText("Spoken replies are unavailable in this environment. Showing text only."),
      ).toBeTruthy(),
    );
    expect(screen.getByText("You spent PHP 1,250 this month.")).toBeTruthy();
    expect(spoken.listen).not.toHaveBeenCalled();
  });

  it("renders special character ** for bolding in assistant response", async () => {
    const m = mocks();
    m.createAssistantThreadTurn.mockResolvedValueOnce({
      ...turnResult(),
      assistantMessage: {
        ...turnResult().assistantMessage,
        content: "You spent **PHP 1,250** this month.",
      },
    });
    const { spoken, captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");

    await waitFor(() => expect(spoken.listen).toHaveBeenCalled());
    captured.ended?.();

    expect(await screen.findByText("PHP 1,250")).toBeTruthy();
    expect(await screen.findByText("this month.")).toBeTruthy();
  });

  it("resets voice status to idle when transcript is empty", async () => {
    const { recorder, captured } = installHookMocks();
    const props = { ...baseProps };
    const { rerender } = await render(<AssistantVoiceConversation {...props} />);
    setRecorderPhase(rerender, recorder, "recording", <AssistantVoiceConversation {...props} />);
    expect(await screen.findByText("You can now speak")).toBeTruthy();

    await captured.transcript?.("   ");

    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
    expect(screen.queryByText("You can now speak")).toBeNull();
  });

  it("cancels warm-up when the orb is pressed while preparing", async () => {
    const { recorder } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Preparing microphone"));

    expect(recorder.cancelRecording).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
  });

  it("renders close button with back-to-text-chat label and no 'Text chat' text", async () => {
    installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByLabelText("Back to text chat")).toBeTruthy();
    expect(screen.queryByText("Text chat")).toBeNull();
  });

  it("renders suggested prompt chips in empty state and sends turn when pressed", async () => {
    const m = mocks();
    const { recorder } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByText("Ready to talk")).toBeTruthy();
    // Let auto-start reach warm-up so the chip press exercises the cancel path.
    await waitFor(() => expect(recorder.startRecording).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Please wait…")).toBeTruthy();
    const chip = screen.getByLabelText("How much did I spend this month?");
    expect(chip).toBeTruthy();

    fireEvent.press(chip);
    // The auto-started take is dropped so its late transcript can't double-send.
    expect(recorder.cancelRecording).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(m.createAssistantThreadTurn).toHaveBeenCalledWith(
        { accessToken: "token" },
        expect.objectContaining({ message: "How much did I spend this month?", kind: "voice" }),
      ),
    );
  });

  it("resets session and clears captions when reset button is pressed", async () => {
    const { spoken, captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");
    captured.ended?.();

    expect(
      await screen.findByText("You spent PHP 1,250 this month.", {}, { timeout: 4000 }),
    ).toBeTruthy();
    const resetBtn = await screen.findByLabelText("Reset conversation");
    expect(resetBtn).toBeTruthy();

    fireEvent.press(resetBtn);
    await waitFor(() => {
      expect(screen.queryByText("You spent PHP 1,250 this month.")).toBeNull();
    });
    expect(await screen.findByText("Ready to talk")).toBeTruthy();
  });

  it("interrupts speaking playback when orb is pressed while speaking", async () => {
    const { spoken, captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByText("Please wait…")).toBeTruthy();

    await captured.transcript?.("How much did I spend?");

    const stopSpeakingBtn = await screen.findByLabelText("Stop speaking");
    expect(stopSpeakingBtn).toBeTruthy();

    fireEvent.press(stopSpeakingBtn);
    expect(spoken.listen).toHaveBeenCalled();
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
  });
});

