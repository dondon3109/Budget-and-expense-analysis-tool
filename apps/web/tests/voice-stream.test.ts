// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_FINALIZATION_TIMEOUT_MS,
  startLiveTranscriptionSession,
} from "../src/lib/voiceStream";

const apiMocks = vi.hoisted(() => ({
  openVoiceStreamWebSocket: vi.fn(),
  describeVoiceStreamFailure: vi.fn().mockResolvedValue("WebSocket connection to voice stream failed."),
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

  it("stop() is async and resolves early when final transcript arrives during grace period", async () => {
    vi.useFakeTimers();
    try {
      const workspace = { key: "user:user-1", userId: "user-1" } as any;
      const onFinal = vi.fn();
      const session = await startLiveTranscriptionSession(workspace, mockMediaStream, {
        onPartial: vi.fn(),
        onFinal,
      });

      const stopPromise = session.stop();
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));
      expect(mockWs.close).not.toHaveBeenCalled();

      let resolved = false;
      void stopPromise.then(() => {
        resolved = true;
      });
      // Allow microtasks but not timeout
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Advance 300ms then deliver final transcript within grace period
      await vi.advanceTimersByTimeAsync(300);
      expect(resolved).toBe(false);
      mockWs.on_message({
        data: JSON.stringify({ type: "final", transcript: "Delayed final" }),
      });
      expect(onFinal).toHaveBeenCalledWith("Delayed final");
      // Let the finalization trigger resolve
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(true);
      expect(mockWs.close).toHaveBeenCalled();

      // Ensure stop is idempotent — second call returns same promise
      const second = session.stop();
      expect(second).toBe(stopPromise);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() resolves after bounded timeout when no transcript arrives", async () => {
    vi.useFakeTimers();
    try {
      const workspace = { key: "user:user-1", userId: "user-1" } as any;
      const session = await startLiveTranscriptionSession(workspace, mockMediaStream, {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
      });
      const stopPromise = session.stop();
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));

      let resolved = false;
      void stopPromise.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(LIVE_FINALIZATION_TIMEOUT_MS - 100);
      await Promise.resolve();
      expect(resolved).toBe(false);
      expect(mockWs.close).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      await stopPromise;
      expect(resolved).toBe(true);
      expect(mockWs.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() resolves early when explicit error arrives during grace", async () => {
    vi.useFakeTimers();
    try {
      const workspace = { key: "user:user-1", userId: "user-1" } as any;
      const onError = vi.fn();
      const session = await startLiveTranscriptionSession(workspace, mockMediaStream, {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError,
      });
      const stopPromise = session.stop();
      await Promise.resolve();
      // Send error during grace
      await vi.advanceTimersByTimeAsync(200);
      mockWs.on_message({
        data: JSON.stringify({ type: "error", code: "rate_limit", message: "Too many" }),
      });
      expect(onError).toHaveBeenCalled();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await expect(stopPromise).resolves.toBeUndefined();
      expect(mockWs.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() handles WebSocket CONNECTING state by waiting for open to send stop", async () => {
    vi.useFakeTimers();
    try {
      const workspace = { key: "user:user-1", userId: "user-1" } as any;
      const session = await startLiveTranscriptionSession(workspace, mockMediaStream, {
        onPartial: vi.fn(),
        onFinal: vi.fn(),
      });
      // Simulate that ws went back to CONNECTING (early stop race)
      mockWs.readyState = 0;
      mockWs.send.mockClear();
      mockWs.close.mockClear();

      const onOpenHandlers: Array<() => void> = [];
      const onCloseHandlers: Array<() => void> = [];
      mockWs.addEventListener.mockImplementation((event: string, handler: () => void) => {
        if (event === "open") onOpenHandlers.push(handler);
        if (event === "close") onCloseHandlers.push(handler);
        mockWs[`on_${event}`] = handler;
      });

      const stopPromise = session.stop();
      expect(mockWs.send).not.toHaveBeenCalled();

      // Simulate ws opening 100ms later
      await vi.advanceTimersByTimeAsync(100);
      mockWs.readyState = 1;
      onOpenHandlers.forEach((h) => h());
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "stop" }));

      // Then final arrives
      await vi.advanceTimersByTimeAsync(100);
      mockWs.on_message({
        data: JSON.stringify({ type: "final", transcript: "Hello after reconnect" }),
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await expect(stopPromise).resolves.toBeUndefined();
      expect(mockWs.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
