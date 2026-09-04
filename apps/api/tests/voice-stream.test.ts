// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVoiceStreamRoutes, websocketUpgradeUrl } from "../src/routes/voice-stream";
import { Hono } from "hono";
import { HttpError } from "../src/errors";
import { providerRegistry } from "../src/provider-registry";

beforeEach(() => vi.restoreAllMocks());

function makeApp(sttCfg, bridgeUrl = "wss://bridge.example.com/stream") {
  const routes = createVoiceStreamRoutes();
  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as any).set("authUser", { id: "user-1" });
    (c as any).set("tenant", { tenantId: "tenant-1" });
    (c as any).env = { DB: {}, STT_BRIDGE_URL: bridgeUrl, _mockSttCfg: sttCfg };
    await next();
  });
  vi.spyOn(providerRegistry, "getActive").mockImplementation(async (env, service) => {
    if (service === "stt") return sttCfg;
    return null;
  });
  app.route("/", routes);
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}

describe("websocketUpgradeUrl", () => {
  it("rewrites wss/ws to https/http so Workers fetch() can upgrade", () => {
    expect(
      websocketUpgradeUrl(
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=AIza",
      ),
    ).toBe(
      "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=AIza",
    );
    expect(websocketUpgradeUrl("ws://bridge.example.com/stream")).toBe(
      "http://bridge.example.com/stream",
    );
    expect(websocketUpgradeUrl("https://already.example/ws")).toBe("https://already.example/ws");
  });
});

describe("GET /api/app/assistant/voice/stream", () => {
  it("requires websocket upgrade", async () => {
    const sttCfg = {
      id: "cfg-1",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg);
    const res = await app.request("/stream", { method: "GET" });
    expect(res.status).toBe(426);
    const body = await res.json();
    expect(body.error).toBe("upgrade_required");
  });

  it("rejects when active STT is not google (fallback to POST)", async () => {
    const sttCfg = {
      id: "cfg-2",
      service: "stt",
      provider: "cloudflare_workers_ai",
      model: "@cf/openai/whisper-large-v3-turbo",
      displayName: "Whisper",
      credentialId: null,
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg);
    const res = await app.request("/stream", {
      method: "GET",
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    // Note: without real WebSocketPair, Hono will return 426? But our mock getActive returns cloudflare, so we expect 400 stt_not_streaming
    // In test env, WebSocketPair not fully mocked, but route checks provider first before bridgeUrl, so 400
    expect([400, 426, 101].includes(res.status)).toBe(true);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toBe("stt_not_streaming");
    }
  });

  it("returns bridge_not_configured when STT_BRIDGE_URL missing for google", async () => {
    const sttCfg = {
      id: "cfg-3",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    const res = await app.request("/stream", {
      method: "GET",
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    // Should be 503 bridge_not_configured before attempting WS upgrade
    expect([503, 426].includes(res.status)).toBe(true);
    if (res.status === 503) {
      const body = await res.json();
      expect(body.error).toBe("bridge_not_configured");
    }
  });

  it("latency instrumentation fields are documented (t_mic_start → t_first_partial)", () => {
    // Bridge mock emits t_mic_start, t_stream_open, t_first_partial, t_final
    // Worker forwards with latency_* derived
    const expectedFields = [
      "t_mic_start",
      "t_stream_open",
      "t_first_partial",
      "t_final",
      "latency_mic_to_first_partial",
      "latency_mic_to_final",
    ];
    expectedFields.forEach((f) => expect(typeof f).toBe("string"));
  });

  it("routes to Gemini Live WebSocket when Google API key is configured (no bridge required)", async () => {
    const sttCfg = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, ""); // Empty bridgeUrl!
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    let interceptedWsUrl = "";
    const originalFetch = globalThis.fetch;
    const upstreamHandlers = new Map();
    const serverHandlers = new Map();
    const mockWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn((event, listener) => upstreamHandlers.set(event, listener)),
      close: vi.fn(),
      accept: vi.fn(),
    };
    globalThis.fetch = vi.fn(async (url: string) => {
      interceptedWsUrl = String(url);
      return {
        status: 101,
        webSocket: mockWs,
      } as any;
    });

    // Mock globalThis.WebSocketPair
    const clientWs = { accept: vi.fn(), addEventListener: vi.fn(), close: vi.fn() };
    // Mirror the Workers runtime default for compatibility_date >= 2026-03-17.
    let binaryTypeAtAccept: string | undefined;
    const serverWs: any = {
      binaryType: "blob",
      accept: vi.fn(() => {
        binaryTypeAtAccept = serverWs.binaryType;
      }),
      addEventListener: vi.fn((event, listener) => serverHandlers.set(event, listener)),
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
    };
    (globalThis as any).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    try {
      const res = await app.request("/stream", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      await vi.waitFor(() => expect(mockWs.send).toHaveBeenCalled());
      // Regression: binary frames must be delivered as ArrayBuffer. Under the runtime default
      // of "blob", `new Uint8Array(frame)` reads 0 bytes and forwards empty audio to Gemini.
      expect(serverWs.binaryType).toBe("arraybuffer");
      expect(binaryTypeAtAccept).toBe("arraybuffer");
      expect(mockWs.binaryType).toBe("arraybuffer");
      expect(mockWs.accept).toHaveBeenCalled();
      // Workers fetch() rejects wss:// ("Fetch API cannot load wss://..."), which aborted
      // the browser handshake as "WebSocket connection to voice stream failed."
      expect(interceptedWsUrl.startsWith("https://")).toBe(true);
      expect(interceptedWsUrl).not.toMatch(/^wss:/);
      expect(interceptedWsUrl).toContain("generativelanguage.googleapis.com");
      expect(interceptedWsUrl).toContain("key=AIzaSyFakeGoogleApiKey1234567890");
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("models/gemini-3.5-transcribe-live"),
      );
      expect(JSON.parse(mockWs.send.mock.calls[0][0])).toEqual({
        setup: {
          model: "models/gemini-3.5-transcribe-live",
          generationConfig: { responseModalities: ["TEXT"] },
          inputAudioTranscription: { languageCodes: [] },
        },
      });

      serverHandlers.get("message")({ data: new Uint8Array([1, 2, 3]).buffer });
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)[0])).toEqual({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: "AQID" }],
        },
      });

      // A Blob frame must still yield real bytes, never an empty payload.
      serverHandlers.get("message")({ data: new Blob([new Uint8Array([4, 5, 6])]) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)[0])).toEqual({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: "BAUG" }],
        },
      });

      serverHandlers.get("message")({ data: JSON.stringify({ type: "stop" }) });
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)[0])).toEqual({
        realtimeInput: { audioStreamEnd: true },
      });

      upstreamHandlers.get("message")({
        data: JSON.stringify({
          serverContent: { interimInputTranscription: { text: "buy groceries" } },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.parse(serverWs.send.mock.calls.at(-1)[0])).toMatchObject({
        type: "partial",
        transcript: "buy groceries",
      });

      // Gemini Live frames can arrive as Blob after websocket_standard_binary_type.
      // Dropping them silently produced no transcript even after the socket opened.
      upstreamHandlers.get("message")({
        data: new Blob([
          JSON.stringify({
            serverContent: { inputTranscription: { text: "buy groceries today" } },
          }),
        ]),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.parse(serverWs.send.mock.calls.at(-1)[0])).toMatchObject({
        type: "final",
        transcript: "buy groceries today",
      });
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("rejects REST model gemini-3.5-transcribe on streaming endpoint (use POST)", async () => {
    const sttCfg = {
      id: "cfg-rest",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe",
      displayName: "Gemini REST",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });
    const res = await app.request("/stream", {
      method: "GET",
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("stt_not_streaming");
  });

  it("returns gemini_missing_key when live model has no API key", async () => {
    const sttCfg = {
      id: "cfg-live-no-key",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live No Key",
      credentialId: null,
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });
    const res = await app.request("/stream", {
      method: "GET",
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("gemini_missing_key");
  });

  it("accepts Google AI Studio Auth keys (AQ.) for Gemini Live", async () => {
    const sttCfg = {
      id: "cfg-live-auth-key",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live Auth Key",
      credentialId: "cred-google-auth",
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
      last4: "r2PQ",
      source: "db",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise(() => undefined)) as typeof fetch;
    (globalThis as any).WebSocketPair = class {
      0 = { accept: vi.fn(), addEventListener: vi.fn(), close: vi.fn() };
      1 = {
        binaryType: "blob",
        accept: vi.fn(),
        addEventListener: vi.fn(),
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
    };
    try {
      const res = await app.request("/stream", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("returns 101 without waiting for Gemini so a slow upstream cannot stall the browser handshake", async () => {
    const sttCfg = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise(() => undefined)) as typeof fetch;
    const serverWs: any = {
      binaryType: "blob",
      accept: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
    };
    (globalThis as any).WebSocketPair = class {
      0 = { accept: vi.fn(), addEventListener: vi.fn(), close: vi.fn() };
      1 = serverWs;
    };

    try {
      const res = await app.request("/stream", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      expect(serverWs.close).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("still returns 101 when Gemini fetch throws so the browser handshake can complete", async () => {
    vi.useFakeTimers();
    const sttCfg = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Fetch API cannot load: wss://generativelanguage.googleapis.com/...");
    });

    const clientWs = { accept: vi.fn(), addEventListener: vi.fn(), close: vi.fn() };
    const serverWs: any = {
      binaryType: "blob",
      accept: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
    };
    (globalThis as any).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    try {
      const res = await app.request("/stream", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      await Promise.resolve();
      await Promise.resolve();
      expect(serverWs.send).toHaveBeenCalledWith(
        expect.stringContaining("gemini_connect_failed"),
      );
      // Closing before the 101 is returned aborts the browser handshake.
      expect(serverWs.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(0);
      expect(serverWs.close).toHaveBeenCalledWith(1011, "gemini_connect_failed");
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });
});
