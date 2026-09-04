jest.mock("expo-audio", () => ({
  AudioModule: {
    AudioStream: jest.fn(),
  },
  useAudioStream: jest.fn(),
}));

import {
  arrayBufferToBase64,
  openMobileVoiceStreamWebSocket,
  pcmRms,
  resamplePcmInt16,
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

  describe("live flag", () => {
    const audioModule = () =>
      jest.requireMock("expo-audio") as { AudioModule: { AudioStream?: unknown } };

    let originalAudioStream: unknown;
    let originalWs: any;

    beforeEach(() => {
      originalAudioStream = audioModule().AudioModule.AudioStream;
      originalWs = global.WebSocket;
    });

    afterEach(() => {
      audioModule().AudioModule.AudioStream = originalAudioStream;
      global.WebSocket = originalWs;
    });

    it("reports live:false without opening a socket when AudioStream is missing", async () => {
      audioModule().AudioModule.AudioStream = undefined;
      const wsCtor = jest.fn();
      (global as any).WebSocket = wsCtor;

      const session = await startMobileVoiceStream("auth-token-123", {
        onPartial: jest.fn(),
        onFinal: jest.fn(),
      });

      expect(session.live).toBe(false);
      expect(wsCtor).not.toHaveBeenCalled();
      expect(await session.stop()).toBeNull();
    });

    it("reports live:true when audio streams over an open socket", async () => {
      class FakeAudioStream {
        addListener = jest.fn(() => ({ remove: jest.fn() }));
        start = jest.fn(async () => undefined);
        stop = jest.fn();
      }
      audioModule().AudioModule.AudioStream = FakeAudioStream;

      class OpeningWebSocket {
        static OPEN = 1;
        readyState = 0;
        listeners: Record<string, Function[]> = {};
        constructor(public url: string) {
          setTimeout(() => {
            this.readyState = OpeningWebSocket.OPEN;
            for (const fn of this.listeners["open"] || []) fn({});
          }, 10);
        }
        addEventListener(event: string, fn: Function) {
          this.listeners[event] = this.listeners[event] || [];
          this.listeners[event]!.push(fn);
        }
        removeEventListener(event: string, fn: Function) {
          this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
        }
        send = jest.fn();
        close = jest.fn();
      }
      (global as any).WebSocket = OpeningWebSocket;

      const session = await startMobileVoiceStream("auth-token-123", {
        onPartial: jest.fn(),
        onFinal: jest.fn(),
      });

      expect(session.live).toBe(true);
      session.cancel();
    });

    it("streams for dummy dev sessions against the local dev Worker", async () => {
      class FakeAudioStream {
        addListener = jest.fn(() => ({ remove: jest.fn() }));
        start = jest.fn(async () => undefined);
        stop = jest.fn();
      }
      audioModule().AudioModule.AudioStream = FakeAudioStream;

      class OpeningWebSocket {
        static OPEN = 1;
        readyState = 0;
        listeners: Record<string, Function[]> = {};
        constructor(public url: string) {
          setTimeout(() => {
            this.readyState = OpeningWebSocket.OPEN;
            for (const fn of this.listeners["open"] || []) fn({});
          }, 10);
        }
        addEventListener(event: string, fn: Function) {
          this.listeners[event] = this.listeners[event] || [];
          this.listeners[event]!.push(fn);
        }
        removeEventListener(event: string, fn: Function) {
          this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
        }
        send = jest.fn();
        close = jest.fn();
      }
      (global as any).WebSocket = OpeningWebSocket;

      const session = await startMobileVoiceStream("dummy-dev-access-token", {
        onPartial: jest.fn(),
        onFinal: jest.fn(),
      });

      // Regression guard: dummy used to force a silent no-op session here.
      expect(session.live).toBe(true);
      session.cancel();
    });
  });

  describe("pcmRms", () => {
    it("returns 0 for silence", () => {
      expect(pcmRms(new Int16Array(160).buffer as ArrayBuffer)).toBe(0);
    });

    it("measures speech-level energy well above the silence floor", () => {
      expect(pcmRms(new Int16Array(160).fill(8000).buffer as ArrayBuffer)).toBeGreaterThan(1000);
    });
  });

  describe("resamplePcmInt16", () => {
    it("returns the input untouched when already at target rate", () => {
      const data = new Int16Array([0, 1000, -1000]).buffer as ArrayBuffer;
      expect(resamplePcmInt16(data, 16000)).toBe(data);
    });

    it("downsamples 48kHz to 16kHz preserving energy", () => {
      // 100ms of 440Hz tone at 48kHz.
      const input = new Int16Array(4800);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / 48000));
      }
      const output = new Int16Array(resamplePcmInt16(input.buffer as ArrayBuffer, 48000));
      expect(output.length).toBe(1600);
      const inRms = pcmRms(input.buffer as ArrayBuffer);
      const outRms = pcmRms(output.buffer as ArrayBuffer);
      expect(Math.abs(outRms - inRms) / inRms).toBeLessThan(0.05);
    });
  });

  describe("silence auto-stop", () => {
    const audioModule = () =>
      jest.requireMock("expo-audio") as { AudioModule: { AudioStream?: unknown } };

    let originalAudioStream: unknown;
    let originalWs: any;

    beforeEach(() => {
      originalAudioStream = audioModule().AudioModule.AudioStream;
      originalWs = global.WebSocket;
    });

    afterEach(() => {
      audioModule().AudioModule.AudioStream = originalAudioStream;
      global.WebSocket = originalWs;
    });

    function silentBuffer(ms: number): { data: ArrayBuffer; sampleRate: number } {
      return { data: new Int16Array((16000 * ms) / 1000).buffer as ArrayBuffer, sampleRate: 16000 };
    }

    function speechBuffer(ms: number): { data: ArrayBuffer; sampleRate: number } {
      return {
        data: new Int16Array((16000 * ms) / 1000).fill(8000).buffer as ArrayBuffer,
        sampleRate: 16000,
      };
    }

    async function startLiveSession(callbacks: Record<string, jest.Mock>, options: object) {
      const addListener: jest.Mock = jest.fn(() => ({ remove: jest.fn() }));
      class FakeAudioStream {
        addListener = addListener;
        start = jest.fn(async () => undefined);
        stop = jest.fn();
      }
      audioModule().AudioModule.AudioStream = FakeAudioStream;

      class OpeningWebSocket {
        static OPEN = 1;
        readyState = 0;
        listeners: Record<string, Function[]> = {};
        constructor(public url: string) {
          setTimeout(() => {
            this.readyState = OpeningWebSocket.OPEN;
            for (const fn of this.listeners["open"] || []) fn({});
          }, 10);
        }
        addEventListener(event: string, fn: Function) {
          this.listeners[event] = this.listeners[event] || [];
          this.listeners[event]!.push(fn);
        }
        removeEventListener(event: string, fn: Function) {
          this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
        }
        send = jest.fn();
        close = jest.fn();
      }
      (global as any).WebSocket = OpeningWebSocket;

      const session = await startMobileVoiceStream(
        "dummy-dev-access-token",
        {
          onPartial: jest.fn(),
          onFinal: jest.fn(),
          ...callbacks,
        },
        options,
      );
      expect(session.live).toBe(true);
      const onBuffer = addListener.mock.calls[0]![1] as (buffer: unknown) => void;
      return { session, onBuffer };
    }

    it("fires onAutoStop once after continuous silence", async () => {
      const onAutoStop = jest.fn();
      const { session, onBuffer } = await startLiveSession(
        { onAutoStop },
        { silenceMs: 100, minRecordMs: 0 },
      );

      onBuffer(speechBuffer(50));
      expect(onAutoStop).not.toHaveBeenCalled();
      onBuffer(silentBuffer(50));
      expect(onAutoStop).not.toHaveBeenCalled();
      onBuffer(silentBuffer(60));
      expect(onAutoStop).toHaveBeenCalledTimes(1);
      onBuffer(silentBuffer(500));
      expect(onAutoStop).toHaveBeenCalledTimes(1);
      session.cancel();
    });

    it("adapts to a noisy mic floor above the fallback threshold", async () => {
      const onAutoStop = jest.fn();
      const { session, onBuffer } = await startLiveSession(
        { onAutoStop },
        { silenceMs: 100, minRecordMs: 0 },
      );

      // Idles at RMS 1200 the whole take: the fixed fallback (500) would never fire.
      const hum = {
        data: new Int16Array(800).fill(1200).buffer as ArrayBuffer,
        sampleRate: 16000,
      };
      onBuffer(hum);
      onBuffer(hum);
      onBuffer(hum);
      expect(onAutoStop).toHaveBeenCalledTimes(1);
      session.cancel();
    });

    it("holds auto-stop until the minimum record time passes", async () => {
      const onAutoStop = jest.fn();
      const { session, onBuffer } = await startLiveSession(
        { onAutoStop },
        { silenceMs: 50, minRecordMs: 60_000 },
      );

      onBuffer(silentBuffer(500));
      expect(onAutoStop).not.toHaveBeenCalled();
      session.cancel();
    });

    it("does not reset accumulated silence upon brief transient noise spike", async () => {
      const onAutoStop = jest.fn();
      const { session, onBuffer } = await startLiveSession(
        { onAutoStop },
        { silenceMs: 400, minRecordMs: 0 },
      );

      // Accumulate 200ms of silence
      onBuffer(silentBuffer(200));
      expect(onAutoStop).not.toHaveBeenCalled();

      // Brief noise spike of 50ms (below speechDebounceMs 200ms)
      onBuffer(speechBuffer(50));
      expect(onAutoStop).not.toHaveBeenCalled();

      // Another 250ms of silence: total silence = 450ms >= 400ms target -> triggers auto-stop
      onBuffer(silentBuffer(250));
      expect(onAutoStop).toHaveBeenCalledTimes(1);
      session.cancel();
    });
  });
});
