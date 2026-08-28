// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "../src/components/assistant/AssistantVoiceControl";
import { LIVE_FINALIZATION_TIMEOUT_MS } from "../src/lib/voiceStream";

const apiMocks = vi.hoisted(() => ({
  getAssistantVoicePreferences: vi.fn(),
  getAssistantVoicePreview: vi.fn(),
  grantAssistantVoiceConsent: vi.fn(),
  transcribeAssistantVoice: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const voiceStreamMocks = vi.hoisted(() => {
  const LIVE_FINALIZATION_TIMEOUT_MS = 3000;
  let capturedCallbacks: any = null;
  let stopImplementation: (() => Promise<void>) | null = null;

  const startLiveTranscriptionSession = vi.fn(async (_workspace: any, _stream: any, callbacks: any) => {
    capturedCallbacks = callbacks;
    if (stopImplementation) {
      return { stop: vi.fn(stopImplementation) };
    }
    return {
      stop: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, LIVE_FINALIZATION_TIMEOUT_MS))),
    };
  });

  return {
    startLiveTranscriptionSession,
    LIVE_FINALIZATION_TIMEOUT_MS,
    __captured: () => capturedCallbacks,
    __setStopImplementation: (fn: (() => Promise<void>) | null) => {
      stopImplementation = fn;
    },
    __reset: () => {
      capturedCallbacks = null;
      stopImplementation = null;
      startLiveTranscriptionSession.mockClear();
    },
  };
});

vi.mock("../src/lib/voiceStream", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    startLiveTranscriptionSession: voiceStreamMocks.startLiveTranscriptionSession,
    LIVE_FINALIZATION_TIMEOUT_MS: voiceStreamMocks.LIVE_FINALIZATION_TIMEOUT_MS,
  };
});

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
  vi.stubGlobal("AudioContext", MockAudioContext as any);
  return { stopTrack, stream };
}

const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMap.set(key, String(value));
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key);
  }),
  clear: vi.fn(() => {
    storageMap.clear();
  }),
  key: vi.fn((index: number) => Array.from(storageMap.keys())[index] ?? null),
  get length() {
    return storageMap.size;
  },
};
Object.defineProperty(window, "localStorage", { value: mockStorage, writable: true });

beforeEach(() => {
  window.localStorage.clear();
  sampleLevel = 128;
  voiceStreamMocks.__reset();
  apiMocks.getAssistantVoicePreferences.mockResolvedValue({
    enabled: true,
    speechAvailable: true,
    reviewRequired: true,
    consentedAt: "2026-08-12T10:00:00.000Z",
    consentVersion: 3,
    transcriptionModel: "gemini-3.5-transcribe-live",
    ttsModel: "s2.1-pro-free",
  } as any);
  apiMocks.getAssistantVoicePreview.mockResolvedValue(new Blob(["preview"], { type: "audio/mpeg" }));
  apiMocks.transcribeAssistantVoice.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantVoiceControl — Gemini Live finalization race", () => {
  it("does NOT show no-speech error when final transcript arrives delayed after MediaRecorder.stop", async () => {
    vi.useFakeTimers();
    installRecordingMocks();

    let finalDelivered = false;

    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(async (_w: any, _s: any, callbacks: any) => {
      return {
        stop: vi.fn(() => {
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              if (!finalDelivered) {
                finalDelivered = true;
                callbacks.onFinal("Spent 20 pesos on coffee");
              }
              resolve();
            }, 400);
          });
        }),
      };
    });

    const onTranscript = vi.fn();
    render(<AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Transcribing");
    expect(onTranscript).not.toHaveBeenCalled();
    expect(screen.queryByText(/Live transcription did not capture any speech/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live transcription didn't return any speech/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
    });

    expect(onTranscript).toHaveBeenCalledWith("Spent 20 pesos on coffee", expect.objectContaining({ submissionMode: "review" }));
    expect(screen.getByText("Transcript ready — review or edit it, then press Send.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();
  });

  it("shows generic no-speech error after bounded timeout when no transcript arrives", async () => {
    vi.useFakeTimers();
    installRecordingMocks();

    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(async () => {
      return {
        stop: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, LIVE_FINALIZATION_TIMEOUT_MS))),
      };
    });

    const onTranscript = vi.fn();
    render(<AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FINALIZATION_TIMEOUT_MS - 100);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();
    expect(screen.queryByText(/Live transcription did not capture/i)).not.toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
    });
    expect(screen.getByText(/Live transcription did not capture any speech|Live transcription didn't return any speech/i)).toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();
  });

  it("preserves meaningful provider error instead of generic no-speech message", async () => {
    vi.useFakeTimers();
    installRecordingMocks();

    let capturedCallbacks: any = null;
    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(async (_w: any, _s: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      return {
        stop: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, LIVE_FINALIZATION_TIMEOUT_MS))),
      };
    });

    const onTranscript = vi.fn();
    render(<AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedCallbacks.onError(new Error("Voice mode is busy. Try again shortly."));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_FINALIZATION_TIMEOUT_MS);
      await Promise.resolve();
    });

    expect(screen.getByText("Voice mode is busy. Try again shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/Live transcription did not capture/i)).not.toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("handles user stopping before WebSocket session opens (early stop race)", async () => {
    vi.useFakeTimers();
    installRecordingMocks();

    let capturedCallbacks: any = null;
    let wsOpenResolve: ((v: any) => void) | null = null;

    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation((_w: any, _s: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      const wsPromise: Promise<any> = new Promise<any>((resolve) => {
        wsOpenResolve = resolve;
      });
      return wsPromise.then(() => ({
        stop: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                callbacks.onFinal("Early stop transcript");
                resolve();
              }, 200);
            }),
        ),
      }));
    });

    const onTranscript = vi.fn();
    render(<AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      wsOpenResolve!({
        stop: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                capturedCallbacks.onFinal("Early stop transcript");
                resolve();
              }, 200);
            }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(onTranscript).toHaveBeenCalledWith("Early stop transcript", expect.any(Object));
    expect(screen.getByText("Transcript ready — review or edit it, then press Send.")).toBeInTheDocument();
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();
  });

  it("delivers final transcript arriving during grace after short recording", async () => {
    vi.useFakeTimers();
    installRecordingMocks();

    voiceStreamMocks.startLiveTranscriptionSession.mockImplementation(async (_w: any, _s: any, callbacks: any) => {
      return {
        stop: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                callbacks.onFinal("Short hello");
                resolve();
              }, 500);
            }),
        ),
      };
    });

    const onTranscript = vi.fn();
    render(<AssistantVoiceControl workspace={workspace} disabled={false} onTranscript={onTranscript} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Transcribing your voice recording" })).toBeInTheDocument();
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
      await Promise.resolve();
    });

    expect(onTranscript).toHaveBeenCalledWith("Short hello", expect.any(Object));
    expect(apiMocks.transcribeAssistantVoice).not.toHaveBeenCalled();
  });
});
