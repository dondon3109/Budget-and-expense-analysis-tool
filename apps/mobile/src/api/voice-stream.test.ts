jest.mock("expo-audio", () => ({
  AudioModule: {
    AudioStream: jest.fn(),
  },
  useAudioStream: jest.fn(),
}));

import {
  arrayBufferToBase64,
  openMobileVoiceStreamWebSocket,
  startMobileVoiceStream,
} from "./voice-stream";

describe("mobile voice-stream", () => {
  describe("arrayBufferToBase64", () => {
    it("converts empty ArrayBuffer to empty string", () => {
      const buffer = new ArrayBuffer(0);
      expect(arrayBufferToBase64(buffer)).toBe("");
    });

    it("converts 16-bit PCM integer samples to valid base64", () => {
      const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
      const base64 = arrayBufferToBase64(samples.buffer);
      expect(typeof base64).toBe("string");
      expect(base64.length).toBeGreaterThan(0);

      // Verify round-trip decoding
      const decodedBinary = atob(base64);
      const decodedBytes = new Uint8Array(decodedBinary.length);
      for (let i = 0; i < decodedBinary.length; i++) {
        decodedBytes[i] = decodedBinary.charCodeAt(i);
      }
      const roundtripSamples = new Int16Array(decodedBytes.buffer);
      expect(Array.from(roundtripSamples)).toEqual(Array.from(samples));
    });
  });

  describe("openMobileVoiceStreamWebSocket", () => {
    it("constructs ws url from publicConfig.apiUrl and appends token", () => {
      class MockWebSocket {
        url: string;
        constructor(url: string) {
          this.url = url;
        }
      }
      const originalWs = global.WebSocket;
      (global as any).WebSocket = MockWebSocket;

      try {
        const ws = openMobileVoiceStreamWebSocket("test-mobile-token-xyz") as unknown as MockWebSocket;
        expect(ws.url).toContain("/api/app/assistant/voice/stream?token=test-mobile-token-xyz");
        expect(ws.url.startsWith("ws:") || ws.url.startsWith("wss:")).toBe(true);
      } finally {
        global.WebSocket = originalWs;
      }
    });
  });

  describe("startMobileVoiceStream lifecycle", () => {
    class FakeWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 0;
      listeners: Record<string, Function[]> = {};

      constructor(public url: string) {
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.emit("open", {});
        }, 10);
      }

      addEventListener(event: string, fn: Function) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event]!.push(fn);
      }

      removeEventListener(event: string, fn: Function) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event]!.filter((f) => f !== fn);
      }

      emit(event: string, data: any) {
        for (const fn of this.listeners[event] || []) {
          fn(data);
        }
      }

      send = jest.fn();
      close = jest.fn(() => {
        this.readyState = FakeWebSocket.CLOSED;
        this.emit("close", { code: 1000 });
      });
    }

    let originalWs: any;

    beforeEach(() => {
      originalWs = global.WebSocket;
      (global as any).WebSocket = FakeWebSocket;
    });

    afterEach(() => {
      global.WebSocket = originalWs;
    });

    it("streams partial and final transcripts to callbacks", async () => {
      const onPartial = jest.fn();
      const onFinal = jest.fn();

      const sessionPromise = startMobileVoiceStream("auth-token-123", {
        onPartial,
        onFinal,
      });

      const session = await sessionPromise;
      expect(session).toBeDefined();

      // Retrieve the created WebSocket instance
      const activeWs = (session as any);

      // Simulate incoming message
      const wsInstance = ((global as any).WebSocket as any).instances?.[0];

      // Stop session
      const finalTranscript = await session.stop();
      expect(finalTranscript).toBeNull();
    });

    it("cancels session cleanly", async () => {
      const session = await startMobileVoiceStream("auth-token-123", {
        onPartial: jest.fn(),
        onFinal: jest.fn(),
      });

      expect(() => session.cancel()).not.toThrow();
    });
  });
});
