// @vitest-environment jsdom
import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  CURRENT_RECEIPT_CONSENT_VERSION,
} from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "../src/components/assistant/AssistantVoiceControl";
import {
  TransactionVoiceEntry,
  type TransactionVoiceEntryProps,
} from "../src/components/transactions/TransactionVoiceEntry";

/**
 * Locks the browser SpeechRecognition rules shared by the assistant microphone and the
 * transaction voice entry: Auto stays on the server engine, an explicitly chosen language is
 * forwarded as a BCP-47 tag, and a server transcript always outranks the browser hypothesis.
 */
const VOICE_LANGUAGE_STORAGE_KEY = "zoption_voice_language";

const apiMocks = vi.hoisted(() => ({
  getAssistantVoicePreferences: vi.fn(),
  grantAssistantVoiceConsent: vi.fn(),
  transcribeAssistantVoice: vi.fn(),
  getReceiptPreferences: vi.fn(),
  grantReceiptConsent: vi.fn(),
  extractVoiceTransaction: vi.fn(),
}));

const voiceStreamMocks = vi.hoisted(() => ({
  startLiveTranscriptionSession: vi.fn(
    async (
      _workspace: unknown,
      _stream: unknown,
      _callbacks: { onPartial: (text: string) => void; onFinal: (text: string) => void },
      _language?: string,
    ) => ({ stop: vi.fn(async () => undefined) }),
  ),
  LIVE_FINALIZATION_TIMEOUT_MS: 3000,
}));

vi.mock("../src/lib/api", () => apiMocks);
vi.mock("../src/lib/voiceStream", () => voiceStreamMocks);

const workspace = { key: "user:test-user" as const, userId: "test-user" };

const draft = {
  transcript: "Spent 250 pesos on lunch today",
  description: "Lunch",
  date: "2026-08-22",
  amountMinor: 25_000,
  currency: "PHP" as const,
  kind: "expense" as const,
  categoryName: "Food & dining",
};

class FakeMediaRecorder {
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

/** Browser speech engine stand-in; the transcript is pushed through onresult by the tests. */
class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
  onspeechend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

function installSpeechRecognition() {
  const recognitions: FakeSpeechRecognition[] = [];
  class CountingSpeechRecognition extends FakeSpeechRecognition {
    constructor() {
      super();
      recognitions.push(this);
    }
  }
  vi.stubGlobal("SpeechRecognition", CountingSpeechRecognition);
  vi.stubGlobal("webkitSpeechRecognition", CountingSpeechRecognition);
  return recognitions;
}

function installRecordingMocks() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
}

function renderAssistant(onTranscript: (text: string) => void) {
  render(
    <AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />,
  );
}

async function startAssistantRecording() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
  await act(async () => {
    await Promise.resolve();
  });
}

function renderEntry(props: Partial<TransactionVoiceEntryProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionVoiceEntry workspace={workspace} onDraft={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

async function startTransactionRecording() {
  fireEvent.click(await screen.findByRole("button", { name: "Speak a transaction" }));
  await screen.findByRole("button", { name: "Stop and review" });
}

beforeEach(() => {
  window.localStorage.clear();
  apiMocks.getAssistantVoicePreferences.mockResolvedValue({
    enabled: true,
    speechAvailable: true,
    reviewRequired: false,
    consentedAt: "2026-08-12T10:00:00.000Z",
    consentVersion: CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
    transcriptionModel: "gemini-3.5-transcribe-live",
    ttsModel: "s2.1-pro-free",
  });
  apiMocks.getReceiptPreferences.mockResolvedValue({
    enabled: true,
    consentedAt: "2026-08-13T00:00:00.000Z",
    consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
    visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
  });
  apiMocks.extractVoiceTransaction.mockResolvedValue(draft);
  voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(async () => ({
    stop: vi.fn(async () => undefined),
  }));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("browser speech recognition", () => {
  it("never constructs a recognizer while the voice language is Auto", async () => {
    const recognitions = installSpeechRecognition();
    installRecordingMocks();
    // Guard: the stub is installed, so "no construction" is a decision, not a missing API.
    expect(typeof (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition).toBe(
      "function",
    );

    renderAssistant(vi.fn());
    await startAssistantRecording();
    expect(screen.queryByRole("button", { name: "Stop voice recording" })).not.toBeNull();

    renderEntry();
    await startTransactionRecording();

    expect(recognitions).toHaveLength(0);
  });

  it('starts the recognizer with lang "en-US" when the stored language is English', async () => {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "en");
    const recognitions = installSpeechRecognition();
    installRecordingMocks();

    renderAssistant(vi.fn());
    await startAssistantRecording();

    expect(recognitions).toHaveLength(1);
    expect(recognitions[0]?.lang).toBe("en-US");
  });

  it('starts the recognizer with lang "fil-PH" when the stored language is Tagalog', async () => {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "fil");
    const recognitions = installSpeechRecognition();
    installRecordingMocks();

    renderEntry();
    await startTransactionRecording();

    expect(recognitions).toHaveLength(1);
    expect(recognitions[0]?.lang).toBe("fil-PH");
  });

  it("prefers the server transcript over the browser hypothesis in AssistantVoiceControl", async () => {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "en");
    const recognitions = installSpeechRecognition();
    installRecordingMocks();
    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(
      async (
        _workspace: unknown,
        _stream: unknown,
        callbacks: { onPartial: (text: string) => void },
      ) => {
        callbacks.onPartial("Spent 250 pesos on lunch today");
        return { stop: vi.fn(async () => undefined) };
      },
    );
    const onTranscript = vi.fn();

    renderAssistant(onTranscript);
    await startAssistantRecording();

    act(() => {
      recognitions[0]!.onresult?.({
        results: [[{ transcript: "spent 250 pieces of lunch today" }]],
      });
    });
    // The browser hypothesis reached the component before the server text won.
    expect(screen.getByRole("status").textContent).toContain("spent 250 pieces of lunch today");

    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));

    await waitFor(() => expect(onTranscript).toHaveBeenCalledOnce());
    expect(onTranscript).toHaveBeenCalledWith("Spent 250 pesos on lunch today", expect.anything());
  });

  it("prefers the server transcript over the browser hypothesis in TransactionVoiceEntry", async () => {
    window.localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, "en");
    const recognitions = installSpeechRecognition();
    installRecordingMocks();
    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(
      async (
        _workspace: unknown,
        _stream: unknown,
        callbacks: { onPartial: (text: string) => void },
      ) => {
        callbacks.onPartial("Spent 250 pesos on lunch today");
        return { stop: vi.fn(async () => undefined) };
      },
    );

    renderEntry();
    await startTransactionRecording();

    act(() => {
      recognitions[0]!.onresult?.({
        results: [[{ transcript: "spent 250 pieces of lunch today" }]],
      });
    });
    // The browser hypothesis reached the component before the server text won.
    expect(screen.getByRole("alert").textContent).toContain("spent 250 pieces of lunch today");

    fireEvent.click(screen.getByRole("button", { name: "Stop and review" }));

    await waitFor(() =>
      expect(apiMocks.extractVoiceTransaction).toHaveBeenCalledWith(
        workspace,
        { transcript: "Spent 250 pesos on lunch today" },
        undefined,
        "en",
      ),
    );
    expect(apiMocks.extractVoiceTransaction).toHaveBeenCalledOnce();
  });
});
