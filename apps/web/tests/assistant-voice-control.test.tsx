// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "../src/components/assistant/AssistantVoiceControl";

const apiMocks = vi.hoisted(() => ({
  getAssistantVoicePreferences: vi.fn(),
  grantAssistantVoiceConsent: vi.fn(),
  transcribeAssistantVoice: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const workspace = { key: "user:test-user" as const, userId: "test-user" };

let sampleLevel = 128;

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
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(sampleLevel),
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

/**
 * Minimal storage stub for environments whose jsdom build exposes no
 * window.localStorage. The text composer never reads stored voice options;
 * this only lets the test seed a stale value left by older versions.
 */
function ensureLocalStorage() {
  if (window.localStorage) {
    window.localStorage.clear();
    return;
  }
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      get length() {
        return store.size;
      },
    },
  });
}

function installRecordingMocks() {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  vi.stubGlobal("AudioContext", MockAudioContext);
  return { stopTrack };
}

beforeEach(() => {
  sampleLevel = 128;
  apiMocks.getAssistantVoicePreferences.mockResolvedValue({
    enabled: true,
    speechAvailable: true,
    reviewRequired: true,
    consentedAt: null,
    consentVersion: 0,
    transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
    ttsModel: "s2.1-pro-free",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantVoiceControl", () => {
  it("shows the provider disclosure before requesting microphone access", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );

    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));

    const notice = screen.getByRole("dialog", { name: "Voice notice" });
    expect(notice).toHaveFocus();
    expect(notice).toHaveTextContent("recording is sent to Cloudflare Workers AI");
    expect(notice).toHaveTextContent("review the finished transcript before sending");
    expect(notice).toHaveTextContent("Replies in text chat are always text.");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(apiMocks.grantAssistantVoiceConsent).not.toHaveBeenCalled();
  });

  it("requests microphone access from the acceptance click and starts recording", async () => {
    const { stopTrack } = installRecordingMocks();
    let finishConsent!: (
      preferences: Awaited<ReturnType<typeof apiMocks.grantAssistantVoiceConsent>>,
    ) => void;
    apiMocks.grantAssistantVoiceConsent.mockReturnValueOnce(
      new Promise((resolve) => {
        finishConsent = resolve;
      }),
    );

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept and record" }));

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Enabling voice…" })).toBeDisabled();

    await act(async () => {
      finishConsent({
        enabled: true,
        speechAvailable: true,
        reviewRequired: true,
        consentedAt: "2026-08-12T10:00:00.000Z",
        consentVersion: 3,
        transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
        ttsModel: "s2.1-pro-free",
      });
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog", { name: "Voice notice" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it("keeps consent failures visible in the voice notice and releases the microphone", async () => {
    const { stopTrack } = installRecordingMocks();
    apiMocks.grantAssistantVoiceConsent.mockRejectedValueOnce(
      new Error("Voice consent could not be saved. Try again."),
    );

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept and record" }));

    const notice = screen.getByRole("dialog", { name: "Voice notice" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Voice consent could not be saved. Try again.",
    );
    expect(notice).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("button", { name: "Accept and record" })).toBeEnabled();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("closes the disclosure with Escape and restores microphone focus", async () => {
    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );
    const microphone = screen.getByRole("button", { name: "Start voice recording" });
    fireEvent.click(microphone);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Voice notice" })).not.toBeInTheDocument();
    expect(microphone).toHaveFocus();
  });

  it("renders the microphone with no voice settings control", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: true,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );
    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());

    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voice settings" })).not.toBeInTheDocument();
    expect(document.querySelector(".assistant-voice-settings-button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Voice settings" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pick a voice you like")).not.toBeInTheDocument();
  });

  it("always submits transcripts as text replies", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    apiMocks.transcribeAssistantVoice.mockResolvedValue({
      text: "Where did my money go?",
      durationSeconds: 2,
    });
    const onTranscript = vi.fn();

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={onTranscript}
      />,
    );
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("Where did my money go?", {
        submissionMode: "review",
        replyMode: "text",
        speechVoice: "default",
      }),
    );
  });

  it("ignores a stored spoken replyMode left by older versions", async () => {
    installRecordingMocks();
    ensureLocalStorage();
    window.localStorage.setItem(
      "zoption:assistant-voice-options:test-user",
      JSON.stringify({ submissionMode: "review", replyMode: "spoken", speechVoice: "bright" }),
    );
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    apiMocks.transcribeAssistantVoice.mockResolvedValue({
      text: "Where did my money go?",
      durationSeconds: 2,
    });
    const onTranscript = vi.fn();

    try {
      render(
        <AssistantVoiceControl
          workspace={workspace}
          disabled={false}
          reviewRequired={false}
          onTranscript={onTranscript}
        />,
      );
      await act(async () => Promise.resolve());

      fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
      await act(async () => Promise.resolve());
      fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));

      await waitFor(() =>
        expect(onTranscript).toHaveBeenCalledWith("Where did my money go?", {
          submissionMode: "review",
          replyMode: "text",
          speechVoice: "default",
        }),
      );
    } finally {
      window.localStorage.removeItem("zoption:assistant-voice-options:test-user");
    }
  });

  it("stops after the speaker falls silent and waits for the completed transcript", async () => {
    vi.useFakeTimers();
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    let finishTranscription!: (result: { text: string; durationSeconds: number }) => void;
    apiMocks.transcribeAssistantVoice.mockReturnValue(
      new Promise((resolve) => {
        finishTranscription = resolve;
      }),
    );
    const onTranscript = vi.fn();

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={onTranscript}
      />,
    );
    await act(async () => Promise.resolve());

    sampleLevel = 160;
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(200));
    sampleLevel = 128;
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    await act(async () => Promise.resolve());

    const transcribing = screen.getByRole("button", {
      name: "Transcribing your voice recording",
    });
    expect(transcribing).toBeDisabled();
    expect(apiMocks.transcribeAssistantVoice).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      finishTranscription({ text: "How much did I spend?", durationSeconds: 2 });
      await Promise.resolve();
    });
    expect(onTranscript).toHaveBeenCalledWith("How much did I spend?", {
      submissionMode: "review",
      replyMode: "text",
      speechVoice: "default",
    });
  });

  it("removes transcript guidance once the reviewed message is sent", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: true,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    apiMocks.transcribeAssistantVoice.mockResolvedValue({
      text: "How much did I spend?",
      durationSeconds: 2,
    });
    const onTranscript = vi.fn();
    const { rerender } = render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={onTranscript}
      />,
    );
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));

    expect(
      await screen.findByText("Transcript ready — review or edit it, then press Send."),
    ).toBeInTheDocument();
    expect(onTranscript).toHaveBeenCalledOnce();

    rerender(
      <AssistantVoiceControl
        workspace={workspace}
        disabled
        reviewRequired
        onTranscript={onTranscript}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Transcript ready — review or edit it, then press Send."),
      ).not.toBeInTheDocument(),
    );
  });

  it("ends an empty recording without submitting it for transcription", async () => {
    vi.useFakeTimers();
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());

    await act(async () => vi.advanceTimersByTimeAsync(7_100));

    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("I didn’t hear anything");
  });

  it("keeps the microphone visible while recording and shows a running timer", async () => {
    vi.useFakeTimers();
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());

    const recordingButton = screen.getByRole("button", { name: "Stop voice recording" });
    expect(recordingButton).toHaveClass("recording");
    expect(recordingButton.querySelector("svg")).not.toHaveClass("spinning");
    expect(screen.getByRole("status")).toHaveTextContent("Listening · 0:00");

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByRole("status")).toHaveTextContent("Listening · 0:02");
  });

  it("shows an explicit loader while transcribing, distinct from recording", async () => {
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    let finishTranscription!: (result: { text: string; durationSeconds: number }) => void;
    apiMocks.transcribeAssistantVoice.mockReturnValue(
      new Promise((resolve) => {
        finishTranscription = resolve;
      }),
    );

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => Promise.resolve());

    const transcribingButton = screen.getByRole("button", {
      name: "Transcribing your voice recording",
    });
    expect(transcribingButton).toBeDisabled();
    expect(transcribingButton).toHaveClass("transcribing");
    expect(transcribingButton.querySelector("svg")).toHaveClass("spinning");
    expect(screen.getByRole("status")).toHaveTextContent("Transcribing…");

    await act(async () => {
      finishTranscription({ text: "Hello", durationSeconds: 1 });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeInTheDocument();
  });
});
