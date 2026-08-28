// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startLiveTranscriptionSession } from "../src/lib/voiceStream";

const apiMocks = vi.hoisted(() => ({
  openVoiceStreamWebSocket: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

describe("startLiveTranscriptionSession", () => {
  let mockWs: any;
  let mockAudioContext: any;
  let mockProcessor: any;
  let mockSource: any;
  let mockMediaStream: any;

  beforeEach(() => {
    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        mockWs[`on_${event}`] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    mockProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as any,
    };

    mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      state: "running",
      createMediaStreamSource: vi.fn(() => mockSource),
      createScriptProcessor: vi.fn(() => mockProcessor),
      close: vi.fn(async () => {}),
      destination: {},
    };

    mockMediaStream = {
      getTracks: vi.fn(() => []),
    };

    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          return mockAudioContext;
        }
      },
    );
    apiMocks.openVoiceStreamWebSocket.mockResolvedValue(mockWs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("connects audio processor and streams PCM chunks to WebSocket", async () => {
    const workspace = { key: "user:user-1", userId: "user-1" } as any;
    const onPartial = vi.fn();
    const onFinal = vi.fn();

    const session = await startLiveTranscriptionSession(workspace, mockMediaStream, {
      onPartial,
      onFinal,
    });

    expect(apiMocks.openVoiceStreamWebSocket).toHaveBeenCalledWith(workspace);
    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockMediaStream);
    expect(mockAudioContext.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
    expect(mockSource.connect).toHaveBeenCalledWith(mockProcessor);

    // Simulate audio processing event with float32 samples
    const fakeAudioEvent = {
      inputBuffer: {
        getChannelData: () => new Float32Array([0.5, -0.5, 0.0]),
      },
    };
    mockProcessor.onaudioprocess(fakeAudioEvent);

    expect(mockWs.send).toHaveBeenCalled();
    const sentData = mockWs.send.mock.calls[0][0];
    expect(sentData instanceof ArrayBuffer).toBe(true);

    // Simulate incoming partial transcript
    mockWs.on_message({
      data: JSON.stringify({ type: "partial", transcript: "Spent twenty pesos" }),
    });
    expect(onPartial).toHaveBeenCalledWith("Spent twenty pesos");

    // Simulate incoming final transcript
    mockWs.on_message({
      data: JSON.stringify({ type: "final", transcript: "Spent twenty pesos on coffee." }),
    });
    expect(onFinal).toHaveBeenCalledWith("Spent twenty pesos on coffee.");

    // Clean stop
    session.stop();
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));
  });

  it("rejects gracefully when WebSocket fails to connect", async () => {
    const closedWs = {
      readyState: 0, // CONNECTING
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (event === "error") {
          setTimeout(() => handler(new Event("error")), 10);
        }
      }),
      removeEventListener: vi.fn(),
    };
    apiMocks.openVoiceStreamWebSocket.mockResolvedValue(closedWs);

    const workspace = { key: "user:user-1", userId: "user-1" } as any;
    await expect(
      startLiveTranscriptionSession(workspace, mockMediaStream, {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
      }),
    ).rejects.toThrow("WebSocket connection to voice stream failed.");
  });

  it("forwards latency metrics to onLatency", async () => {
    const workspace = { key: "user:user-1", userId: "user-1" } as any;
    const onLatency = vi.fn();
    await startLiveTranscriptionSession(workspace, mockMediaStream, {
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onLatency,
    });
    mockWs.on_message({
      data: JSON.stringify({
        type: "partial",
        transcript: "hello",
        t_worker_first_partial: 1234,
        latency_worker_to_first_partial: 123,
      }),
    });
    expect(onLatency).toHaveBeenCalledWith({
      t_worker_first_partial: 1234,
      latency_worker_to_first_partial: 123,
    });
  });

  it("surfaces rate_limit and bridge errors via onError with actionable messages", async () => {
    const workspace = { key: "user:user-1", userId: "user-1" } as any;
    const onError = vi.fn();
    await startLiveTranscriptionSession(workspace, mockMediaStream, {
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError,
    });
    mockWs.on_message({
      data: JSON.stringify({ type: "error", code: "rate_limit", message: "Too many" }),
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Voice mode is busy. Try again shortly." }),
    );
    mockWs.on_message({
      data: JSON.stringify({ type: "error", code: "gemini_missing_key", message: "Live transcription not configured" }),
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Live transcription not configured") }),
    );
  });
});
