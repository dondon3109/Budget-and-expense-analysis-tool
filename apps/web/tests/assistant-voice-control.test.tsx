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
  window.localStorage.clear();
  sampleLevel = 128;
  apiMocks.getAssistantVoicePreferences.mockResolvedValue({
    enabled: true,
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
    expect(notice).toHaveTextContent("choose spoken replies");
    expect(notice).toHaveTextContent("assistant reply text is sent to Fish Audio");
    expect(notice).toHaveTextContent("choose whether to review the finished transcript");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(apiMocks.grantAssistantVoiceConsent).not.toHaveBeenCalled();
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

  it("offers persisted transcript and reply choices when automatic sending is allowed", async () => {
    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired={false}
        onTranscript={vi.fn()}
      />,
    );

    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));

    const settings = screen.getByRole("dialog", { name: "Voice settings" });
    fireEvent.click(screen.getByRole("radio", { name: /Send automatically/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Text only/i }));

    expect(screen.getByRole("radio", { name: /Send automatically/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Text only/i })).toBeChecked();
    expect(settings).toHaveTextContent("Recording stops automatically");
    expect(
      JSON.parse(window.localStorage.getItem("zoption:assistant-voice-options:test-user")!),
    ).toEqual({ submissionMode: "automatic", replyMode: "text" });
  });

  it("keeps automatic sending unavailable when transcript review is required", async () => {
    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));

    expect(screen.getByRole("radio", { name: /Review first/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Send automatically/i })).toBeDisabled();
  });

  it("stops after the speaker falls silent and waits for the completed transcript", async () => {
    vi.useFakeTimers();
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
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
    fireEvent.click(screen.getByRole("button", { name: "Voice settings" }));
    fireEvent.click(screen.getByRole("radio", { name: /Send automatically/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Text only/i }));
    fireEvent.click(screen.getByRole("button", { name: "Close voice settings" }));

    sampleLevel = 160;
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(200));
    sampleLevel = 128;
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      finishTranscription({ text: "How much did I spend?", durationSeconds: 2 });
      await Promise.resolve();
    });
    expect(onTranscript).toHaveBeenCalledWith("How much did I spend?", {
      submissionMode: "automatic",
      replyMode: "text",
    });
  });

  it("ends an empty recording without submitting it for transcription", async () => {
    vi.useFakeTimers();
    installRecordingMocks();
    apiMocks.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
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
});
