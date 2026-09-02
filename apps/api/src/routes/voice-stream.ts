import { Hono } from "hono";

import type { AppEnvironment, Bindings } from "../types";
import { providerRegistry } from "../provider-registry";
import type { PlatformAdminService } from "../platform-admin";
import { isGoogleGenerativeLanguageApiKey, parseGoogleSecret } from "../assistant/google-stt";

/**
 * Realtime STT WebSocket proxy:
 *   Option A (Gemini Live API): Browser --WSS--> Worker (/api/app/assistant/voice/stream) --WSS--> Google Gemini Live API
 *   Option B (Cloud Run bridge): Browser --WSS--> Worker (/api/app/assistant/voice/stream) --WSS--> Cloud Run bridge --gRPC--> Speech V2 chirp_3
 *
 * Auth: Supabase JWT via createAuthMiddleware (Authorization Bearer header, ?token= query, or Sec-WebSocket-Protocol).
 * Active config is global (providerRegistry.getActive('stt')), not per-tenant — affects all users immediately (invalidate).
 * Latency instrumentation: t_mic_start from client header/param, t_stream_open/first_partial/final, forwarded to client.
 */
function createWebSocketResponse(client: WebSocket): Response {
  try {
    return new Response(null, { status: 101, webSocket: client });
  } catch {
    const res = new Response(null, { status: 200 });
    (res as unknown as Record<string, unknown>).webSocket = client;
    Object.defineProperty(res, "status", { value: 101 });
    return res;
  }
}

/**
 * Workers `fetch()` WebSocket upgrades travel over HTTP(S). Passing `wss://` is
 * rejected (`Fetch API cannot load wss://...`), which aborted the client
 * handshake before a 101 could be returned.
 */
export function websocketUpgradeUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice("wss://".length)}`;
  if (url.startsWith("ws://")) return `http://${url.slice("ws://".length)}`;
  return url;
}

type AcceptableSocket = {
  binaryType?: string;
  accept: (options?: { allowHalfOpen?: boolean }) => void;
};

function acceptProxySocket(socket: AcceptableSocket): void {
  // binaryType must be set before accept(); after 2026-03-17 it defaults to "blob".
  socket.binaryType = "arraybuffer";
  try {
    // Half-open is required for proxying once web_socket_auto_reply_to_close is on
    // (compatibility_date >= 2026-04-07); otherwise a close on one side tears down
    // the other before we can forward it.
    socket.accept({ allowHalfOpen: true });
  } catch {
    socket.accept();
  }
}

function decodeSocketData(data: unknown): Promise<string | null> {
  if (typeof data === "string") return Promise.resolve(data);
  if (data instanceof ArrayBuffer) {
    return Promise.resolve(new TextDecoder().decode(data));
  }
  if (ArrayBuffer.isView(data)) {
    return Promise.resolve(new TextDecoder().decode(data));
  }
  if (data && typeof (data as Blob).arrayBuffer === "function") {
    return (data as Blob)
      .arrayBuffer()
      .then((buf) => new TextDecoder().decode(buf))
      .catch(() => null);
  }
  return Promise.resolve(null);
}

function closeAfterHandshake(socket: WebSocket, code: number, reason: string): void {
  // Closing the pair before the 101 response is returned aborts the browser
  // handshake and surfaces as "WebSocket connection to voice stream failed."
  setTimeout(() => {
    try {
      socket.close(code, reason);
    } catch {
      // already closed
    }
  }, 0);
}

export function createVoiceStreamRoutes(_platformAdmins?: PlatformAdminService) {
  void _platformAdmins;
  const routes = new Hono<AppEnvironment>();

  routes.get("/stream", async (context) => {
    const env = context.env as Bindings & { STT_BRIDGE_URL?: string };
    const tenant = (context as unknown as { get: (k: string) => { tenantId: string } }).get(
      "tenant",
    );
    const authUser = (context as unknown as { get: (k: string) => { id: string } }).get("authUser");

    // Check active STT config (global)
    const sttCfg = await providerRegistry.getActive(env, "stt");
    if (!sttCfg) {
      return context.json(
        { error: "stt_not_configured", message: "STT provider not configured." },
        503,
      );
    }

    // Non-google (cloudflare) has no realtime streaming — instruct to use POST
    if (sttCfg.provider !== "google") {
      return context.json(
        {
          error: "stt_not_streaming",
          message: `Active STT provider ${sttCfg.provider} does not support realtime streaming. Use POST /transcriptions or activate google.`,
        },
        400,
      );
    }

    const cred = await providerRegistry.getDecryptedSecret(env, sttCfg);
    const bridgeUrl =
      (env as unknown as Record<string, string | undefined>).STT_BRIDGE_URL?.trim() ||
      env.STT_BRIDGE_URL?.trim();

    // Check if we should use Option A: Gemini Live API
    // Only the dedicated live transcription model should use the Live WebSocket.
    // REST models (gemini-3.5-transcribe) use POST /transcriptions and must not be routed here.
    const parsed = cred.secret ? parseGoogleSecret(cred.secret) : null;
    const token = parsed?.token || "";
    const isGeminiLiveModel = sttCfg.model === "gemini-3.5-transcribe-live";
    const isGeminiLive = Boolean(token && isGoogleGenerativeLanguageApiKey(token) && isGeminiLiveModel);

    // Live model selected but no usable AI Studio / Gemini API key
    if (sttCfg.model === "gemini-3.5-transcribe-live" && !isGoogleGenerativeLanguageApiKey(token)) {
      return context.json(
        {
          error: "gemini_missing_key",
          message:
            "Gemini Live transcription requires a Google AI Studio API key credential. Link a valid API key in AI & Voice Models.",
        },
        503,
      );
    }

    // REST-only Gemini models should not use the streaming socket — instruct to use POST or activate live model
    if (sttCfg.model === "gemini-3.5-transcribe" || sttCfg.model === "gemini-2.0-flash") {
      return context.json(
        {
          error: "stt_not_streaming",
          message:
            "Active model gemini-3.5-transcribe is REST-only. Activate gemini-3.5-transcribe-live for realtime streaming or use POST /transcriptions.",
        },
        400,
      );
    }

    if (!isGeminiLive && !bridgeUrl) {
      return context.json(
        {
          error: "bridge_not_configured",
          message: "STT_BRIDGE_URL not configured and no Google API key credential linked.",
        },
        503,
      );
    }

    const upgrade = context.req.header("upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return context.json(
        { error: "upgrade_required", message: "WebSocket upgrade required." },
        426,
      );
    }

    // WebSocketPair is available in workerd
    const pair = new (
      globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }
    ).WebSocketPair();
    const client = (pair as unknown as Record<string, WebSocket>)[0] as WebSocket;
    const server = (pair as unknown as Record<string, WebSocket>)[1] as WebSocket;

    // Accept client. binaryType and half-open close behavior must be set before accept().
    acceptProxySocket(server as unknown as AcceptableSocket);

    const tWorkerOpen = Date.now();
    let tFirstPartial: number | null = null;

    // Helper to forward safely
    const trySend = (ws: WebSocket, data: string | ArrayBuffer) => {
      try {
        if ((ws as unknown as { readyState: number }).readyState === 1) ws.send(data);
      } catch (_e) { void _e; }
    };

    const micStart = context.req.header("x-t-mic-start") || String(tWorkerOpen);

    // ==========================================
    // OPTION A: Google Gemini Multimodal Live API
    // ==========================================
    if (isGeminiLive) {
      const geminiUrl = websocketUpgradeUrl(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(token)}`,
      );
      let geminiWs: WebSocket | null = null;
      const pendingPcm: Uint8Array[] = [];
      const pendingJson: string[] = [];

      // Send initial setup payload to Gemini Live
      const modelName = sttCfg.model.includes("/") ? sttCfg.model : `models/${sttCfg.model}`;

      const isTranscribeLive = sttCfg.model === "gemini-3.5-transcribe-live";
      const setupPayload = isTranscribeLive
        ? {
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ["TEXT"],
              },
              // This enables the input transcript events returned by the dedicated STT model.
              inputAudioTranscription: {
                languageCodes: [],
              },
            },
          }
        : {
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ["TEXT"],
              },
              systemInstruction: {
                parts: [
                  {
                    text: "You are a real-time speech-to-text transcriber for a budget and finance app. Transcribe the user's spoken words verbatim into text in real time. Do not reply to questions, do not add commentary, and do not wrap in markdown or quotes. Return only the transcribed speech.",
                  },
                ],
              },
            },
          };
      let loggedSetupComplete = false;
      let finalizedTranscript = "";
      const geminiOnMessage = (event: MessageEvent) => {
        void decodeSocketData((event as unknown as { data: unknown }).data).then((raw) => {
          if (!raw || !raw.startsWith("{")) return;
          try {
            const msg = JSON.parse(raw) as {
              error?: { code?: number; message?: string };
              serverContent?: {
                modelTurn?: {
                  parts?: Array<{ text?: string }>;
                };
                inputTranscription?: { text?: string };
                interimInputTranscription?: { text?: string };
                turnComplete?: boolean;
              };
              inputTranscription?: { text?: string };
              input_transcription?: { text?: string };
              interimInputTranscription?: { text?: string };
              interim_input_transcription?: { text?: string };
            };
            if (msg.error) {
              console.error("[voice-stream] Gemini Live error:", JSON.stringify(msg.error));
              trySend(
                server,
                JSON.stringify({
                  type: "error",
                  code: "gemini_error",
                  message: msg.error.message || `Gemini Live error ${msg.error.code || ""}`.trim(),
                }),
              );
              return;
            }
            if ((msg as Record<string, unknown>).setupComplete && !loggedSetupComplete) {
              console.log("[voice-stream] Gemini Live setupComplete");
              loggedSetupComplete = true;
            }
            const finalInputText =
              msg.serverContent?.inputTranscription?.text ||
              (msg as Record<string, unknown>)["inputTranscription"] as string | undefined ||
              (msg as Record<string, unknown>)["input_transcription"] as string | undefined ||
              "";
            const interimInputText =
              msg.serverContent?.interimInputTranscription?.text ||
              msg.interimInputTranscription?.text ||
              msg.interim_input_transcription?.text ||
              "";
            const modelText =
              msg.serverContent?.modelTurn?.parts?.map((p) => p.text || "").join("") || "";
            const finalText = finalInputText || modelText;
            if (finalText || interimInputText) {
              if (finalText) {
                finalizedTranscript = [finalizedTranscript, finalText].filter(Boolean).join(" ").trim();
              }
              const transcript = [finalizedTranscript, interimInputText].filter(Boolean).join(" ").trim();
              const isFinal = Boolean(finalText || msg.serverContent?.turnComplete);
              if (tFirstPartial === null) {
                tFirstPartial = Date.now();
              }
              trySend(
                server,
                JSON.stringify({
                  type: isFinal ? "final" : "partial",
                  transcript,
                  isFinal,
                  t_worker_first_partial: tFirstPartial,
                  latency_worker_to_first_partial: tFirstPartial - tWorkerOpen,
                }),
              );
              if (isFinal) {
                finalizedTranscript = "";
              }
            } else if (msg.serverContent?.turnComplete && finalizedTranscript) {
              if (tFirstPartial === null) tFirstPartial = Date.now();
              trySend(
                server,
                JSON.stringify({
                  type: "final",
                  transcript: finalizedTranscript,
                  isFinal: true,
                  t_worker_first_partial: tFirstPartial,
                  latency_worker_to_first_partial: tFirstPartial - tWorkerOpen,
                }),
              );
              finalizedTranscript = "";
            }
          } catch (_e) { void _e; }
        });
      };

      const geminiOnClose = () => {
        try {
          server.close(1000);
        } catch (_e) { void _e; }
      };
      const geminiOnError = () => {
        trySend(
          server,
          JSON.stringify({
            type: "error",
            code: "gemini_error",
            message: "Google Gemini Live session disconnected.",
          }),
        );
        try {
          server.close(1011);
        } catch (_e) { void _e; }
      };

      const sendPcm = (bytes: Uint8Array) => {
        if (!geminiWs || (geminiWs as unknown as { readyState: number }).readyState !== 1) {
          if (pendingPcm.length < 64) pendingPcm.push(bytes);
          return;
        }
        let binary = "";
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        trySend(
          geminiWs,
          JSON.stringify({
            realtimeInput: {
              audio: { mimeType: "audio/pcm;rate=16000", data: btoa(binary) },
            },
          }),
        );
      };

      const sendGeminiJson = (payload: string) => {
        if (!geminiWs || (geminiWs as unknown as { readyState: number }).readyState !== 1) {
          if (pendingJson.length < 16) pendingJson.push(payload);
          return;
        }
        trySend(geminiWs, payload);
      };

      const flushPending = () => {
        const queuedPcm = pendingPcm.splice(0, pendingPcm.length);
        const queuedJson = pendingJson.splice(0, pendingJson.length);
        for (const bytes of queuedPcm) sendPcm(bytes);
        for (const payload of queuedJson) sendGeminiJson(payload);
      };

      const failGeminiConnect = (message: string, status?: number) => {
        trySend(
          server,
          JSON.stringify({
            type: "error",
            code: "gemini_connect_failed",
            message,
            ...(status !== undefined ? { status } : {}),
          }),
        );
        closeAfterHandshake(server, 1011, "gemini_connect_failed");
      };

      const connectGemini = async () => {
        try {
          const geminiResp = (await fetch(geminiUrl, {
            headers: { Upgrade: "websocket" },
          } as unknown as RequestInit)) as unknown as { status: number; webSocket: WebSocket | null };

          if (geminiResp.status !== 101 || !geminiResp.webSocket) {
            console.error(
              `[voice-stream] gemini_connect_failed HTTP ${geminiResp.status} (no webSocket=${!geminiResp.webSocket})`,
            );
            failGeminiConnect(
              `Failed to connect to Google Gemini Live API (HTTP ${geminiResp.status}). Check Google API key in Provider Configs.`,
              geminiResp.status,
            );
            return;
          }

          geminiWs = geminiResp.webSocket;
          acceptProxySocket(geminiWs as unknown as AcceptableSocket);
          geminiWs.addEventListener("message", geminiOnMessage as EventListener);
          geminiWs.addEventListener("close", geminiOnClose as EventListener);
          geminiWs.addEventListener("error", geminiOnError as EventListener);
          console.log(`[voice-stream] Gemini Live setup sent for ${modelName}`);
          trySend(geminiWs, JSON.stringify(setupPayload));
          flushPending();
        } catch (error) {
          console.error(
            "[voice-stream] gemini_connect_failed",
            error instanceof Error ? error.message : error,
          );
          failGeminiConnect("Unable to establish connection to Google Gemini Live API.");
        }
      };

      const geminiPromise = connectGemini();
      try {
        context.executionCtx.waitUntil(geminiPromise.then(() => undefined, () => undefined));
      } catch {
        // Unit tests and environments without ExecutionContext still keep the accepted socket.
      }

      server.addEventListener("message", (event) => {
        const data = (event as unknown as { data: string | ArrayBuffer | Blob }).data;

        if (typeof data !== "string") {
          if (data instanceof ArrayBuffer) {
            sendPcm(new Uint8Array(data));
            return;
          }
          void data
            .arrayBuffer()
            .then((buf) => sendPcm(new Uint8Array(buf)))
            .catch(() => undefined);
        } else if (data.startsWith("{")) {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            const pcmData = (parsed["data"] as string | undefined) || (parsed["pcm"] as string | undefined);
            if ((parsed["type"] as string) === "audio" && pcmData) {
              sendGeminiJson(
                JSON.stringify({
                  realtimeInput: {
                    audio: { mimeType: "audio/pcm;rate=16000", data: pcmData },
                  },
                }),
              );
            } else if ((parsed["type"] as string) === "stop") {
              sendGeminiJson(
                JSON.stringify({
                  realtimeInput: {
                    audioStreamEnd: true,
                  },
                }),
              );
            }
          } catch (_e) { void _e; }
        }
      });

      server.addEventListener("close", () => {
        if (geminiWs) {
          try {
            geminiWs.close(1000);
          } catch (_e) { void _e; }
        }
      });

      return createWebSocketResponse(client);
    }

    // ==========================================
    // OPTION B: Cloud Run bridge (Speech V2 / chirp_3)
    // ==========================================
    let bridgeWs: WebSocket | null = null;
    try {
      const bridgeResp = (await fetch(websocketUpgradeUrl(bridgeUrl!), {
        headers: {
          Upgrade: "websocket",
          "x-t-mic-start": micStart,
          "x-zoption-tenant": tenant?.tenantId ? String(tenant.tenantId).slice(0, 8) : "anon",
          "x-zoption-user": authUser?.id ? String(authUser.id).slice(0, 8) : "anon",
        },
      } as unknown as RequestInit)) as unknown as {
        status: number;
        webSocket: WebSocket | null;
        headers: Headers;
      };
      if (bridgeResp.status !== 101 || !bridgeResp.webSocket) {
        trySend(
          server,
          JSON.stringify({
            type: "error",
            code: "bridge_connect_failed",
            status: bridgeResp.status,
          }),
        );
        closeAfterHandshake(server, 1011, "bridge_connect_failed");
        return createWebSocketResponse(client);
      }
      bridgeWs = bridgeResp.webSocket;
      acceptProxySocket(bridgeWs as unknown as AcceptableSocket);
    } catch {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_connect_failed" }));
      closeAfterHandshake(server, 1011, "bridge_connect_failed");
      return createWebSocketResponse(client);
    }

    // Bridge → Client
    const bridgeOnMessage = (event: MessageEvent) => {
      const raw = (event as unknown as { data: string | ArrayBuffer }).data;
      if (typeof raw === "string" && raw.startsWith("{")) {
        try {
          const msg = JSON.parse(raw) as Record<string, unknown>;
          if (msg.type === "partial" && tFirstPartial === null) {
            tFirstPartial = Date.now();
            (msg).t_worker_first_partial = tFirstPartial;
            (msg).latency_worker_to_first_partial =
              tFirstPartial - tWorkerOpen;
          }
          trySend(server, JSON.stringify(msg));
          return;
        } catch (_e) { void _e; }
      }
      if (typeof raw === "string") trySend(server, raw);
      else trySend(server, raw);
    };
    const bridgeOnClose = () => {
      try {
        server.close(1000);
      } catch (_e) { void _e; }
    };
    const bridgeOnError = () => {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_error" }));
      try {
        server.close(1011);
      } catch (_e) { void _e; }
    };

    if (bridgeWs) {
      bridgeWs.addEventListener("message", bridgeOnMessage as EventListener);
      bridgeWs.addEventListener("close", bridgeOnClose as EventListener);
      bridgeWs.addEventListener("error", bridgeOnError as EventListener);
    }

    // Client → Bridge
    server.addEventListener("message", (event) => {
      const data = (event as unknown as { data: string | ArrayBuffer }).data;
      if (bridgeWs && (bridgeWs as unknown as { readyState: number }).readyState === 1) {
        try {
          bridgeWs.send(data as unknown as string);
        } catch (_e) { void _e; }
      }
    });
    server.addEventListener("close", () => {
      if (bridgeWs) {
        try {
          bridgeWs.close();
        } catch (_e) { void _e; }
      }
    });

    setTimeout(() => {
      if (bridgeWs && (bridgeWs as unknown as { readyState: number }).readyState !== 1) {
        trySend(server, JSON.stringify({ type: "error", code: "bridge_timeout" }));
      }
    }, 5000);

    return createWebSocketResponse(client);
  });

  return routes;
}
