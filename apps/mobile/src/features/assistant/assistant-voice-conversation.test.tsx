import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// NOTE: drive async hook callbacks directly and assert with findBy/waitFor.
// Wrapping these multi-hop async flows in manual act() breaks subsequent
// renders in this suite (later tests mount empty trees).

import {
  VOICE_CONVERSATION_SPEECH_VOICE,
  AssistantVoiceConversation,
  mapAssistantMessagesToVoiceCaptions,
} from "./AssistantVoiceConversation";
import { ApiTransportError } from "@/api/authenticated";

jest.mock("./assistant-voice-hooks", () => ({
  useAssistantRecorder: jest.fn(),
  useSpokenReplies: jest.fn(),
}));

jest.mock("@/api/assistant", () => ({
  createAssistantThreadTurn: jest.fn(),
  listAssistantMessages: jest.fn(),
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
  listAssistantMessages: jest.Mock;
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
    "createAssistantThreadTurn" | "listAssistantMessages" | "sendAssistantTurn"
  >;
  const voiceApi = jest.requireMock("@/api/assistant-voice") as Pick<
    HookMocks,
    "getAssistantVoicePreferences" | "grantAssistantVoiceConsent"
  >;
  return {
    useAssistantRecorder: hooks.useAssistantRecorder,
    useSpokenReplies: hooks.useSpokenReplies,
    createAssistantThreadTurn: api.createAssistantThreadTurn,
    listAssistantMessages: api.listAssistantMessages,
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
  m.listAssistantMessages.mockResolvedValue({ items: [], nextCursor: null });
});

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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
  });

  it("creates a voice-kind thread and speaks the reply with Bright Female only", async () => {
    const m = mocks();
    const { recorder, spoken, captured } = installHookMocks();
    const onTurnComplete = jest.fn();
    await render(<AssistantVoiceConversation {...baseProps} onTurnComplete={onTurnComplete} />);
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);
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
    expect(onTurnComplete).toHaveBeenCalledWith(expect.objectContaining({ id: THREAD_ID }));

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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    await captured.transcript?.("How much did I spend?");
    expect(await screen.findByText("Speaking…")).toBeTruthy();

    expect(screen.getByText("▍")).toBeTruthy();
    expect(screen.queryByText(/You spent PHP/)).toBeNull();

    captured.ended?.();
    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeTruthy();
  });

  it("says live preview is off while listening without a live session", async () => {
    const m = mocks();
    const { recorder } = installHookMocks();
    m.useAssistantRecorder.mockReturnValue({ ...recorder, liveStatus: "unavailable" });
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));

    expect(await screen.findByText("Live preview is off here", { exact: false })).toBeTruthy();
  });

  it("still shows the reply text when speech synthesis fails", async () => {
    const m = mocks();
    const { captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    await captured.transcript?.("How much did I spend?");

    await waitFor(() => expect(spoken.listen).toHaveBeenCalled());
    captured.ended?.();

    expect(await screen.findByText("PHP 1,250")).toBeTruthy();
    expect(await screen.findByText("this month.")).toBeTruthy();
  });

  it("resets voice status to idle when transcript is empty", async () => {
    const { captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    expect(await screen.findByLabelText("Stop listening")).toBeTruthy();

    await captured.transcript?.("   ");

    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
    expect(screen.queryByLabelText("Stop listening")).toBeNull();
  });

  it("renders close button with back-to-text-chat label and no 'Text chat' text", async () => {
    installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByLabelText("Back to text chat")).toBeTruthy();
    expect(screen.queryByText("Text chat")).toBeNull();
  });

  it("renders suggested prompt chips in empty state and sends turn when pressed", async () => {
    const m = mocks();
    installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByText("Ready to talk")).toBeTruthy();
    const chip = screen.getByLabelText("How much did I spend this month?");
    expect(chip).toBeTruthy();

    fireEvent.press(chip);
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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
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
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    await captured.transcript?.("How much did I spend?");

    const stopSpeakingBtn = await screen.findByLabelText("Stop speaking");
    expect(stopSpeakingBtn).toBeTruthy();

    fireEvent.press(stopSpeakingBtn);
    expect(spoken.listen).toHaveBeenCalled();
    expect(await screen.findByLabelText("Start talking")).toBeTruthy();
  });

  it("maps stored messages to voice captions and drops empty content", () => {
    expect(
      mapAssistantMessagesToVoiceCaptions([
        { id: "u1", role: "user", content: "How much did I spend?" },
        { id: "a1", role: "assistant", content: "You spent PHP 1,250." },
        { id: "blank", role: "assistant", content: "   " },
      ]),
    ).toEqual([
      { id: "u1", role: "user", text: "How much did I spend?" },
      { id: "a1", role: "assistant", text: "You spent PHP 1,250." },
    ]);
  });

  it("starts a fresh session without history when no resume id is given", async () => {
    const m = mocks();
    installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} />);

    expect(await screen.findByText("Ready to talk")).toBeTruthy();
    expect(m.listAssistantMessages).not.toHaveBeenCalled();
  });

  it("resumes a previous voice conversation with prior captions in the voice UI", async () => {
    const m = mocks();
    m.listAssistantMessages.mockResolvedValue({
      items: [
        {
          id: "u-prior",
          threadId: THREAD_ID,
          role: "user",
          content: "How much did I spend?",
          status: "completed",
          createdAt: "2026-08-12T10:00:00.000Z",
        },
        {
          id: "a-prior",
          threadId: THREAD_ID,
          role: "assistant",
          content: "You spent PHP 1,250 this month.",
          status: "completed",
          createdAt: "2026-08-12T10:00:01.000Z",
        },
      ],
      nextCursor: null,
    });
    installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} initialThreadId={THREAD_ID} />);

    expect(m.listAssistantMessages).toHaveBeenCalledWith(
      { accessToken: "token" },
      THREAD_ID,
    );
    // Prior context re-enters the voice UI instead of a blank session.
    expect(await screen.findByText("How much did I spend?")).toBeTruthy();
    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeTruthy();
    expect(screen.queryByText("Ready to talk")).toBeNull();
  });

  it("continues the resumed voice thread instead of creating a new one", async () => {
    const m = mocks();
    m.listAssistantMessages.mockResolvedValue({
      items: [
        {
          id: "u-prior",
          threadId: THREAD_ID,
          role: "user",
          content: "How much did I spend?",
          status: "completed",
          createdAt: "2026-08-12T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    const { captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} initialThreadId={THREAD_ID} />);
    expect(await screen.findByText("How much did I spend?")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    await captured.transcript?.("And on groceries?");

    await waitFor(() =>
      expect(m.sendAssistantTurn).toHaveBeenCalledWith(
        { accessToken: "token" },
        THREAD_ID,
        expect.objectContaining({ message: "And on groceries?", kind: "voice" }),
      ),
    );
    expect(m.createAssistantThreadTurn).not.toHaveBeenCalled();
  });

  it("falls back to a fresh voice session when the resumed thread is gone", async () => {
    const m = mocks();
    m.listAssistantMessages.mockRejectedValue(
      new ApiTransportError("Conversation not found.", "not_found", 404),
    );
    const { captured } = installHookMocks();
    await render(<AssistantVoiceConversation {...baseProps} initialThreadId={THREAD_ID} />);

    expect(await screen.findByText("Ready to talk")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Start talking"));
    await captured.transcript?.("How much did I spend?");

    await waitFor(() => expect(m.createAssistantThreadTurn).toHaveBeenCalled());
  });
});

