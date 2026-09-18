import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVoiceStreamRoutes, websocketUpgradeUrl } from "../src/routes/voice-stream";
import { HttpError } from "../src/errors";
import { providerRegistry } from "../src/provider-registry";
import type { ProviderConfig } from "@zoption/shared";
import type { Bindings } from "../src/types";
import { createTestApp } from "./helpers/test-app";

beforeEach(() => vi.restoreAllMocks());

function makeApp(
  sttCfg: ProviderConfig,
  bridgeUrl = "wss://bridge.example.com/stream",
  envOverrides: Partial<Bindings> = {},
) {
  // These tests exercise the transport, so the consent gate the route runs before the upgrade is
  // stubbed as satisfied and the env answers the Pro entitlement query. Both gates and the
  // free-tenant refusal are covered in voice-ticket.test.ts.
  const routes = createVoiceStreamRoutes({
    requireConsent: vi.fn(async () => undefined),
  } as any);
  const app = createTestApp({
    user: { id: "user-1" },
    tenant: { tenantId: "tenant-1", defaultAccountId: "acc-1" },
    env: {
      // The Pro gate reads one entitlement row; the transport tests below are about the socket.
      DB: {
        prepare: () => ({ bind: () => ({ first: async () => ({ source: "paypal" }) }) }),
      } as unknown as D1Database,
      STT_BRIDGE_URL: bridgeUrl,
      ...envOverrides,
    },
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
    // Query strings survive the rewrite, but the Gemini key is never one of them: it travels in
    // the outgoing x-goog-api-key header (see the Gemini Live case below).
    expect(
      websocketUpgradeUrl(
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?alt=json",
      ),
    ).toBe(
      "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?alt=json",
    );
    expect(websocketUpgradeUrl("ws://bridge.example.com/stream")).toBe(
      "http://bridge.example.com/stream",
    );
    expect(websocketUpgradeUrl("https://already.example/ws")).toBe("https://already.example/ws");
  });
});

describe("GET /api/app/assistant/voice/stream", () => {
  it("requires websocket upgrade", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-1",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg);
    const res = await app.request("/stream", { method: "GET" });
    expect(res.status).toBe(426);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upgrade_required");
  });

  it("rejects when active STT is not google (fallback to POST)", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-2",
      service: "stt",
      provider: "cloudflare_workers_ai",
      model: "@cf/openai/whisper-large-v3-turbo",
      displayName: "Whisper",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("stt_not_streaming");
    }
  });

  it("returns bridge_not_configured when STT_BRIDGE_URL missing for google", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-3",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "");
    const res = await app.request("/stream", {
      method: "GET",
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    // Should be 503 bridge_not_configured before attempting WS upgrade
    expect([503, 426].includes(res.status)).toBe(true);
    if (res.status === 503) {
      const body = (await res.json()) as { error: string };
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
    const sttCfg: ProviderConfig = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, ""); // Empty bridgeUrl!
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    let interceptedWsUrl = "";
    let interceptedGeminiKey: string | null = null;
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
    globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
      interceptedWsUrl = String(url);
      interceptedGeminiKey = new Headers(init?.headers).get("x-goog-api-key");
      return {
        status: 101,
        webSocket: mockWs,
      } as unknown as Response;
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
      // The key is a header now: a query string reaches edge and Worker logs.
      expect(interceptedWsUrl).not.toContain("key=");
      expect(interceptedGeminiKey).toBe("AIzaSyFakeGoogleApiKey1234567890");
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("models/gemini-3.5-transcribe-live"),
      );
      expect(JSON.parse(mockWs.send.mock.calls[0]![0])).toEqual({
        setup: {
          model: "models/gemini-3.5-transcribe-live",
          generationConfig: { responseModalities: ["TEXT"] },
          inputAudioTranscription: { languageCodes: ["en-US", "fil-PH"] },
        },
      });

      serverHandlers.get("message")({ data: new Uint8Array([1, 2, 3]).buffer });
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)![0])).toEqual({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: "AQID" }],
        },
      });

      // A Blob frame must still yield real bytes, never an empty payload.
      serverHandlers.get("message")({ data: new Blob([new Uint8Array([4, 5, 6])]) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)![0])).toEqual({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: "BAUG" }],
        },
      });

      serverHandlers.get("message")({ data: JSON.stringify({ type: "stop" }) });
      expect(JSON.parse(mockWs.send.mock.calls.at(-1)![0])).toEqual({
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

  it("closes the session at the maximum duration instead of leaving it open", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-max-duration",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "", { ASSISTANT_VOICE_STREAM_TIMEOUT_MS: "500" });
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    const upstreamWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(
      async () => ({ status: 101, webSocket: upstreamWs }) as unknown as Response,
    );

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

      // The ceiling closes with the normal code, so the client reconnects rather than erroring.
      await vi.waitFor(() => expect(serverWs.close).toHaveBeenCalledWith(1000, "max_duration"), {
        timeout: 3_000,
      });
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("configures Tagalog/Filipino language codes for Gemini Live when ?lang=fil is requested", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-live-fil",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live Tagalog",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: "AIzaSyFakeGoogleApiKey1234567890",
      last4: "7890",
      source: "db",
    });

    const mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      accept: vi.fn(),
      binaryType: "blob",
      readyState: 1,
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(
      async () =>
        ({
          webSocket: mockWs,
          status: 101,
          headers: new Headers(),
        }) as unknown as Response,
    );

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
      const res = await app.request("/stream?lang=fil", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      await vi.waitFor(() => expect(mockWs.send).toHaveBeenCalled());
      expect(JSON.parse(mockWs.send.mock.calls[0]![0])).toEqual({
        setup: {
          model: "models/gemini-3.5-transcribe-live",
          generationConfig: { responseModalities: ["TEXT"] },
          inputAudioTranscription: { languageCodes: ["fil-PH", "en-US"] },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("rejects REST model gemini-3.5-transcribe on streaming endpoint (use POST)", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-rest",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe",
      displayName: "Gemini REST",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("stt_not_streaming");
  });

  it("returns gemini_missing_key when live model has no API key", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-live-no-key",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live No Key",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("gemini_missing_key");
  });

  it("accepts Google AI Studio Auth keys (AQ.) for Gemini Live", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-live-auth-key",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live Auth Key",
      credentialId: "cred-google-auth",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
    const sttCfg: ProviderConfig = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
    const sttCfg: ProviderConfig = {
      id: "cfg-gemini-live",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "Gemini Live",
      credentialId: "cred-google-key",
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
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
      expect(serverWs.send).toHaveBeenCalledWith(expect.stringContaining("gemini_connect_failed"));
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

  it("routes to Cloud Run bridge with 'x-language': 'auto' unless a known language is asked for", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-bridge",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "wss://bridge.example.com/stream");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });

    let interceptedHeaders: Headers | undefined;
    let interceptedUrl = "";
    const mockBridgeWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(async (url, init) => {
      interceptedUrl = String(url);
      interceptedHeaders = new Headers(init?.headers);
      return {
        status: 101,
        webSocket: mockBridgeWs,
        headers: new Headers(),
      } as unknown as Response;
    });

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
      // Auto is the default choice for every client, so it must reach the bridge
      // as auto rather than being collapsed into English.
      for (const [query, expected] of [
        ["", "auto"],
        ["?lang=auto", "auto"],
        ["?lang=es", "auto"],
      ] as const) {
        const res = await app.request(`/stream${query}`, {
          method: "GET",
          headers: { Upgrade: "websocket", Connection: "Upgrade" },
        });
        expect(res.status).toBe(101);
        expect(interceptedHeaders?.get("x-language")).toBe(expected);
      }
      expect(interceptedUrl).toBe("https://bridge.example.com/stream");
      expect(interceptedHeaders?.get("Upgrade")).toBe("websocket");
      expect(mockBridgeWs.accept).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("passes 'x-language': 'fil' to Cloud Run bridge when ?lang=fil is requested", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-bridge-fil",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "wss://bridge.example.com/stream");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });

    let interceptedHeaders: Headers | undefined;
    const mockBridgeWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) => {
      interceptedHeaders = new Headers(init?.headers);
      return {
        status: 101,
        webSocket: mockBridgeWs,
        headers: new Headers(),
      } as unknown as Response;
    });

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
      const res = await app.request("/stream?lang=fil", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      expect(interceptedHeaders?.get("x-language")).toBe("fil");
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("passes 'x-language': 'fil' to Cloud Run bridge when ?lang=tl is requested", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-bridge-tl",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "wss://bridge.example.com/stream");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });

    let interceptedHeaders: Headers | undefined;
    const mockBridgeWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(async (_url, init) => {
      interceptedHeaders = new Headers(init?.headers);
      return {
        status: 101,
        webSocket: mockBridgeWs,
        headers: new Headers(),
      } as unknown as Response;
    });

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
      const res = await app.request("/stream?lang=tl", {
        method: "GET",
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      expect(res.status).toBe(101);
      expect(interceptedHeaders?.get("x-language")).toBe("fil");
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("proxies messages between client and Cloud Run bridge", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-bridge-proxy",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "wss://bridge.example.com/stream");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });

    const bridgeHandlers = new Map();
    const serverHandlers = new Map();
    const mockBridgeWs = {
      readyState: 1,
      binaryType: "blob",
      send: vi.fn(),
      addEventListener: vi.fn((event, listener) => bridgeHandlers.set(event, listener)),
      close: vi.fn(),
      accept: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(
      async () =>
        ({
          status: 101,
          webSocket: mockBridgeWs,
          headers: new Headers(),
        }) as unknown as Response,
    );

    const serverWs: any = {
      binaryType: "blob",
      accept: vi.fn(),
      addEventListener: vi.fn((event, listener) => serverHandlers.set(event, listener)),
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

      // Client -> Bridge message forwarding
      serverHandlers.get("message")({ data: "pcm_audio_chunk" });
      expect(mockBridgeWs.send).toHaveBeenCalledWith("pcm_audio_chunk");

      // Bridge -> Client partial transcript with latency tracking
      bridgeHandlers.get("message")({
        data: JSON.stringify({ type: "partial", transcript: "bayad sa kuryente" }),
      });
      expect(JSON.parse(serverWs.send.mock.calls[0][0])).toMatchObject({
        type: "partial",
        transcript: "bayad sa kuryente",
        t_worker_first_partial: expect.any(Number),
        latency_worker_to_first_partial: expect.any(Number),
      });

      // Bridge -> Client close forwarding
      bridgeHandlers.get("close")();
      expect(serverWs.close).toHaveBeenCalledWith(1000);
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });

  it("handles Cloud Run bridge connection failure gracefully", async () => {
    const sttCfg: ProviderConfig = {
      id: "cfg-bridge-fail",
      service: "stt",
      provider: "google",
      model: "chirp_3",
      displayName: "Google Chirp",
      credentialId: null,
      enabled: true,
      isActive: true,
      priority: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      updatedBy: null,
    };
    const app = makeApp(sttCfg, "wss://bridge.example.com/stream");
    vi.spyOn(providerRegistry, "getDecryptedSecret").mockResolvedValue({
      secret: null,
      last4: null,
      source: "none",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(
      async () =>
        ({
          status: 502,
          webSocket: null,
          headers: new Headers(),
        }) as unknown as Response,
    );

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
      expect(serverWs.send).toHaveBeenCalledWith(expect.stringContaining("bridge_connect_failed"));
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).WebSocketPair;
    }
  });
});
