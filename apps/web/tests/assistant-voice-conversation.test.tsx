// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AssistantVoiceConversation,
  VOICE_CONVERSATION_SPEECH_VOICE,
} from "../src/components/assistant/AssistantVoiceConversation";

const apiMocks = vi.hoisted(() => ({
  createAssistantThread: vi.fn(),
  getAssistantVoicePreferences: vi.fn(),
  getAssistantVoiceSpeech: vi.fn(),
  grantAssistantVoiceConsent: vi.fn(),
  sendAssistantMessage: vi.fn(),
  transcribeAssistantVoice: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const voiceStreamMocks = vi.hoisted(() => {
  let capturedCallbacks: {
    onPartial: (partial: string) => void;
    onFinal: (final: string) => void;
    onError?: (error: Error) => void;
  } | null = null;

  const startLiveTranscriptionSession = vi.fn(
    async (
      _workspace: unknown,
      _stream: unknown,
      callbacks: {
        onPartial: (partial: string) => void;
        onFinal: (final: string) => void;
        onError?: (error: Error) => void;
      },
    ) => {
      capturedCallbacks = callbacks;
      return { stop: vi.fn(async () => undefined) };
    },
  );

  return {
    startLiveTranscriptionSession,
    captured: () => capturedCallbacks,
    reset: () => {
      capturedCallbacks = null;
      startLiveTranscriptionSession.mockClear();
    },
  };
});

vi.mock("../src/lib/voiceStream", () => ({
  startLiveTranscriptionSession: voiceStreamMocks.startLiveTranscriptionSession,
}));

const workspace = { key: "user:test-user" as const, userId: "test-user" };

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  readonly mimeType = "audio/webm";
  state: RecordingState = "inactive";
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state !== "recording") return;
    this.state = "inactive";
    const dataEvent = new Event("dataavailable");
    Object.defineProperty(dataEvent, "data", { value: new Blob(["voice"]) });
    this.listeners.get("dataavailable")?.forEach((listener) => listener(dataEvent));
    this.listeners.get("stop")?.forEach((listener) => listener(new Event("stop")));
  }
}

class MockAudioContext {
  state: AudioContextState = "running";

  createAnalyser() {
    return {
      fftSize: 512,
      smoothingTimeConstant: 0,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128),
    };
  }

  createMediaStreamSource() {
    return { connect: vi.fn() };
  }

  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => {
    this.state = "closed";
  });
}

const audioInstances: Array<{
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
}> = [];

class MockAudio {
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  duration = 0;
  currentTime = 0;
  paused = false;
  ended = false;
  constructor(public src: string) {
    audioInstances.push(this);
  }
}

function installRecordingMocks() {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("Audio", MockAudio);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:voice-audio"),
    revokeObjectURL: vi.fn(),
  });
  return { getUserMedia, stopTrack };
}

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const USER_MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const ASSISTANT_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

function turnResult() {
  return {
    thread: {
      id: THREAD_ID,
      title: "How much did I spend?",
      kind: "voice" as const,
      lastMessageAt: "2026-08-12T10:00:01.000Z",
      createdAt: "2026-08-12T10:00:00.000Z",
    },
    userMessage: {
      id: USER_MESSAGE_ID,
      threadId: THREAD_ID,
      role: "user" as const,
      content: "How much did I spend?",
      status: "completed" as const,
      createdAt: "2026-08-12T10:00:00.000Z",
    },
    assistantMessage: {
      id: ASSISTANT_MESSAGE_ID,
      threadId: THREAD_ID,
      role: "assistant" as const,
      content: "You spent PHP 1,250 this month.",
      status: "completed" as const,
      createdAt: "2026-08-12T10:00:01.000Z",
    },
  };
}

function consentedPreferences(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    speechAvailable: true,
    reviewRequired: false,
    consentedAt: "2026-08-12T10:00:00.000Z",
    consentVersion: 3,
    transcriptionModel: "gemini-3.5-transcribe-live",
    ttsModel: "s2.1-pro-free",
    ...overrides,
  };
}

function renderConversation(props: { onTurnComplete?: () => void; onClose?: () => void } = {}) {
  return render(
    <AssistantVoiceConversation
      workspace={workspace}
      assistantName="Aster"
      onClose={props.onClose ?? vi.fn()}
      onTurnComplete={props.onTurnComplete ?? vi.fn()}
    />,
  );
}

async function startListening() {
  const startButton = await screen.findByRole("button", { name: "Start talking" });
  fireEvent.click(startButton);
  await act(async () => Promise.resolve());
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
}

async function stopListening() {
  fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
  await act(async () => Promise.resolve());
  await act(async () => Promise.resolve());
}

beforeEach(() => {
  audioInstances.length = 0;
  voiceStreamMocks.reset();
  apiMocks.getAssistantVoicePreferences.mockResolvedValue(consentedPreferences());
  apiMocks.createAssistantThread.mockResolvedValue(turnResult());
  apiMocks.sendAssistantMessage.mockResolvedValue(turnResult());
  apiMocks.getAssistantVoiceSpeech.mockResolvedValue(new Blob(["spoken"], { type: "audio/mpeg" }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantVoiceConversation", () => {
  it("requires voice consent before the microphone is requested", async () => {
    const { getUserMedia } = installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      ...consentedPreferences(),
      consentedAt: null,
      consentVersion: 0,
    });
    apiMocks.grantAssistantVoiceConsent.mockResolvedValue(consentedPreferences());

    renderConversation();
    expect(await screen.findByRole("dialog", { name: "Voice consent" })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await waitFor(() => expect(apiMocks.grantAssistantVoiceConsent).toHaveBeenCalledOnce());
  });

  it("renders live partials in the caption layer", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onPartial("How much did I");
      await Promise.resolve();
    });

    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("How much did I");
  });

  it("speaks the completed reply with Bright Female only and shows its text", async () => {
    expect(VOICE_CONVERSATION_SPEECH_VOICE).toBe("bright");
    installRecordingMocks();
    const onTurnComplete = vi.fn();
    renderConversation({ onTurnComplete });
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() =>
      expect(apiMocks.createAssistantThread).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({ message: "How much did I spend?", kind: "voice" }),
      ),
    );
    await waitFor(() =>
      expect(apiMocks.getAssistantVoiceSpeech).toHaveBeenCalledWith(
        workspace,
        ASSISTANT_MESSAGE_ID,
        "bright",
      ),
    );
    expect(apiMocks.getAssistantVoiceSpeech).toHaveBeenCalledOnce();

    // Assistant reply text types out in the caption layer while audio plays.
    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("How much did I spend?");
    await waitFor(() => expect(captions).toHaveTextContent("You spent PHP 1,250 this month."), {
      timeout: 4000,
    });
    expect(screen.getByText("Speaking…")).toBeInTheDocument();
    expect(onTurnComplete).toHaveBeenCalledOnce();

    expect(audioInstances).toHaveLength(1);
    await act(async () => {
      audioInstances[0]!.onended?.();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Start talking" })).toBeInTheDocument();
  });

  it("types the reply while speaking and snaps to full text when speech ends", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() => expect(apiMocks.getAssistantVoiceSpeech).toHaveBeenCalled());
    expect(await screen.findByText("Speaking…")).toBeInTheDocument();

    // Paced to 50% of the audio (31 chars): 16-char prefix with caret, never the full text.
    await waitFor(() => expect(audioInstances).toHaveLength(1));
    audioInstances[0]!.duration = 10;
    audioInstances[0]!.currentTime = 5;
    const captions = screen.getByLabelText("Conversation captions");
    await waitFor(() => expect(captions.textContent).toContain("You spent PHP 1,"));
    expect(captions.textContent).not.toContain("You spent PHP 1,250 this month.");

    await act(async () => {
      audioInstances[0]!.onended?.();
      await Promise.resolve();
    });
    expect(captions).toHaveTextContent("You spent PHP 1,250 this month.");
    expect(captions.textContent).not.toContain("▍");
    expect(screen.getByRole("button", { name: "Start talking" })).toBeInTheDocument();
  });

  it("holds the caption at the caret until audio is audible", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() => expect(apiMocks.getAssistantVoiceSpeech).toHaveBeenCalled());
    expect(await screen.findByText("Speaking…")).toBeInTheDocument();

    // Audio known but paused (still loading): no letters may outrun the voice.
    await waitFor(() => expect(audioInstances).toHaveLength(1));
    audioInstances[0]!.duration = 10;
    audioInstances[0]!.currentTime = 0;
    audioInstances[0]!.paused = true;
    const captions = screen.getByLabelText("Conversation captions");
    await waitFor(() => expect(captions.textContent).toContain("▍"));
    expect(captions.textContent).not.toContain("You spent PHP");

    await act(async () => {
      audioInstances[0]!.onended?.();
      await Promise.resolve();
    });
    expect(captions).toHaveTextContent("You spent PHP 1,250 this month.");
  });

  it("still shows the reply text when speech synthesis fails", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoiceSpeech.mockRejectedValueOnce(
      new Error("The spoken reply could not be prepared."),
    );
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The spoken reply could not be prepared.",
      ),
    );
    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("You spent PHP 1,250 this month.");
    expect(audioInstances).toHaveLength(0);
  });

  it("shows text with an unavailable notice when speech is not configured", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue(
      consentedPreferences({ speechAvailable: false }),
    );
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Spoken replies are unavailable"),
    );
    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("You spent PHP 1,250 this month.");
    expect(apiMocks.getAssistantVoiceSpeech).not.toHaveBeenCalled();
  });

  it("renders special character ** for bolding in assistant response", async () => {
    installRecordingMocks();
    apiMocks.createAssistantThread.mockResolvedValueOnce({
      ...turnResult(),
      assistantMessage: {
        ...turnResult().assistantMessage,
        content: "You spent **PHP 1,250** on **groceries**.",
      },
    });

    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend on groceries?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() => expect(audioInstances).toHaveLength(1));
    await act(async () => {
      audioInstances[0]!.onended?.();
      await Promise.resolve();
    });

    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("You spent PHP 1,250 on groceries.");
    const boldElements = captions.querySelectorAll("strong.assistant-voice-bold");
    expect(boldElements).toHaveLength(2);
    expect(boldElements[0]).toHaveTextContent("PHP 1,250");
    expect(boldElements[1]).toHaveTextContent("groceries");
  });

  it("captures live partial transcript via browser SpeechRecognition when available", async () => {
    installRecordingMocks();
    const seenRecognitions: any[] = [];
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onspeechend: (() => void) | null = null;
      start(): void {}
      stop(): void {}
      abort(): void {}
    }
    vi.stubGlobal(
      "SpeechRecognition",
      class extends MockSpeechRecognition {
        constructor() {
          super();
          seenRecognitions.push(this);
        }
      },
    );

    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    expect(seenRecognitions).toHaveLength(1);

    await act(async () => {
      seenRecognitions[0].onresult({
        results: [[{ transcript: "What is my grocery budget" }]],
        resultIndex: 0,
      });
      await Promise.resolve();
    });

    const captions = screen.getByLabelText("Conversation captions");
    expect(captions).toHaveTextContent("What is my grocery budget");
  });

  it("automatically stops recording after user finishes speaking via speech end silence", async () => {
    installRecordingMocks();
    const seenRecognitions: any[] = [];
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onspeechend: (() => void) | null = null;
      start(): void {}
      stop(): void {}
      abort(): void {}
    }
    vi.stubGlobal(
      "SpeechRecognition",
      class extends MockSpeechRecognition {
        constructor() {
          super();
          seenRecognitions.push(this);
        }
      },
    );

    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    expect(seenRecognitions).toHaveLength(1);

    await act(async () => {
      seenRecognitions[0].onresult({
        results: [[{ transcript: "How much did I spend on food?" }]],
        resultIndex: 0,
      });
      await Promise.resolve();
    });

    await act(async () => {
      seenRecognitions[0].onspeechend?.();
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    await waitFor(() => expect(apiMocks.createAssistantThread).toHaveBeenCalled());
  });

  it("allows user to interrupt speaking by clicking the orb", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() => expect(apiMocks.getAssistantVoiceSpeech).toHaveBeenCalled());
    expect(await screen.findByText("Speaking…")).toBeInTheDocument();

    const stopSpeakingButton = screen.getByRole("button", { name: "Stop speaking" });
    expect(stopSpeakingButton).toBeInTheDocument();
    expect(stopSpeakingButton).not.toBeDisabled();

    fireEvent.click(stopSpeakingButton);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("button", { name: "Start talking" })).toBeInTheDocument();
    expect(screen.getByLabelText("Conversation captions")).toHaveTextContent(
      "You spent PHP 1,250 this month.",
    );
  });

  it("submits prompt when clicking suggested prompt chip", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());

    const chip = await screen.findByRole("button", { name: /How much did I spend this month/i });
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    await act(async () => Promise.resolve());

    await waitFor(() =>
      expect(apiMocks.createAssistantThread).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({ message: "How much did I spend this month?", kind: "voice" }),
      ),
    );
  });

  it("resets conversation when clicking New session", async () => {
    installRecordingMocks();
    renderConversation();
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled());
    await startListening();

    await act(async () => {
      voiceStreamMocks.captured()?.onFinal("How much did I spend?");
      await Promise.resolve();
    });
    await stopListening();

    await waitFor(() => expect(audioInstances).toHaveLength(1));
    await act(async () => {
      audioInstances[0]!.onended?.();
      await Promise.resolve();
    });

    const resetButton = screen.getByRole("button", { name: "Start new conversation" });
    fireEvent.click(resetButton);
    await act(async () => Promise.resolve());

    expect(screen.getByText("Ready to talk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start new conversation" })).not.toBeInTheDocument();
  });
});

