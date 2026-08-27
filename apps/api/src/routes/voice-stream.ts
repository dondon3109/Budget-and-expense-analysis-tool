import { Hono } from "hono";

import type { AppEnvironment, Bindings } from "../types";
import { providerRegistry } from "../provider-registry";
import type { PlatformAdminService } from "../platform-admin";
import { parseGoogleSecret } from "../assistant/google-stt";

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
    return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
  } catch {
    const res = new Response(null, { status: 200 });
    (res as unknown as Record<string, unknown>).webSocket = client;
    Object.defineProperty(res, "status", { value: 101 });
    return res;
  }
}

export function createVoiceStreamRoutes(_platformAdmins?: PlatformAdminService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/stream", async (context) => {
    const upgrade = context.req.header("upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return context.json(
        { error: "upgrade_required", message: "WebSocket upgrade required." },
        426,
      );
    }

    const env = context.env as Bindings & { STT_BRIDGE_URL?: string };
    const tenant = (context as unknown as { get: (k: string) => { tenantId: string } }).get(
      "tenant",
    );
    const authUser = (context as unknown as { get: (k: string) => { id: string } }).get("authUser");

    // Check active STT config (global)
    const sttCfg = await providerRegistry.getActive(env as Bindings, "stt");
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

    const cred = await providerRegistry.getDecryptedSecret(env as Bindings, sttCfg);
    const bridgeUrl =
      (env as unknown as Record<string, string | undefined>).STT_BRIDGE_URL?.trim() ||
      env.STT_BRIDGE_URL?.trim();

    // Check if we should use Option A: Gemini Live API
    const parsed = cred.secret ? parseGoogleSecret(cred.secret) : null;
    const token = parsed?.token || "";
    const isGeminiLive = Boolean(
      token && (token.startsWith("AIza") || sttCfg.model.startsWith("gemini") || !bridgeUrl),
    );

    if (!isGeminiLive && !bridgeUrl) {
      return context.json(
        {
          error: "bridge_not_configured",
          message: "STT_BRIDGE_URL not configured and no Google API key credential linked.",
        },
        503,
      );
    }

    // WebSocketPair is available in workerd
    const pair = new (
      globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }
    ).WebSocketPair();
    const client = (pair as unknown as Record<string, WebSocket>)[0] as WebSocket;
    const server = (pair as unknown as Record<string, WebSocket>)[1] as WebSocket;

    // Accept client
    (server as unknown as { accept: () => void }).accept();

    const tWorkerOpen = Date.now();
    let tFirstPartial: number | null = null;

    // Helper to forward safely
    const trySend = (ws: WebSocket, data: string | ArrayBuffer) => {
      try {
        if ((ws as unknown as { readyState: number }).readyState === 1) ws.send(data);
      } catch {}
    };

    const micStart = context.req.header("x-t-mic-start") || String(tWorkerOpen);

    // ==========================================
    // OPTION A: Google Gemini Multimodal Live API
    // ==========================================
    if (isGeminiLive) {
      const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(token)}`;
      let geminiWs: WebSocket | null = null;

      try {
        const geminiResp = (await fetch(geminiUrl, {
          headers: {
            Upgrade: "websocket",
          },
        } as unknown as RequestInit)) as unknown as { status: number; webSocket: WebSocket | null };

        if (geminiResp.status !== 101 || !geminiResp.webSocket) {
          trySend(
            server,
            JSON.stringify({
              type: "error",
              code: "gemini_connect_failed",
              status: geminiResp.status,
            }),
          );
          server.close(1011, "gemini_connect_failed");
          return createWebSocketResponse(client);
        }

        geminiWs = geminiResp.webSocket;
        try {
          (geminiWs as unknown as { accept?: () => void }).accept?.();
        } catch {}
      } catch {
        trySend(server, JSON.stringify({ type: "error", code: "gemini_connect_failed" }));
        server.close(1011, "gemini_connect_failed");
        return createWebSocketResponse(client);
      }

      // Send initial setup payload to Gemini Live
      const modelName = sttCfg.model.startsWith("gemini")
        ? sttCfg.model.includes("/")
          ? sttCfg.model
          : `models/${sttCfg.model}`
        : "models/gemini-2.0-flash-exp";

      const setupPayload = {
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
      trySend(geminiWs, JSON.stringify(setupPayload));

      // Handle Gemini -> Browser
      let accumulatedTranscript = "";
      const geminiOnMessage = (event: MessageEvent) => {
        const raw = (event as unknown as { data: string | ArrayBuffer }).data;
        if (typeof raw === "string" && raw.startsWith("{")) {
          try {
            const msg = JSON.parse(raw) as {
              serverContent?: {
                modelTurn?: {
                  parts?: Array<{ text?: string }>;
                };
                turnComplete?: boolean;
              };
            };
            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts && parts.length > 0) {
              for (const part of parts) {
                if (part.text) accumulatedTranscript += part.text;
              }
              const isFinal = Boolean(msg.serverContent?.turnComplete);
              if (tFirstPartial === null) {
                tFirstPartial = Date.now();
              }
              trySend(
                server,
                JSON.stringify({
                  type: isFinal ? "final" : "partial",
                  transcript: accumulatedTranscript.trim(),
                  isFinal,
                  t_worker_first_partial: tFirstPartial,
                  latency_worker_to_first_partial: tFirstPartial - tWorkerOpen,
                }),
              );
              if (isFinal) {
                accumulatedTranscript = "";
              }
            }
          } catch {}
        }
      };

      const geminiOnClose = () => {
        try {
          server.close(1000);
        } catch {}
      };
      const geminiOnError = () => {
        trySend(server, JSON.stringify({ type: "error", code: "gemini_error" }));
        try {
          server.close(1011);
        } catch {}
      };

      geminiWs.addEventListener("message", geminiOnMessage as EventListener);
      geminiWs.addEventListener("close", geminiOnClose as EventListener);
      geminiWs.addEventListener("error", geminiOnError as EventListener);

      // Browser -> Gemini
      server.addEventListener("message", (event) => {
        const data = (event as unknown as { data: string | ArrayBuffer }).data;
        if (!geminiWs || (geminiWs as unknown as { readyState: number }).readyState !== 1) return;

        // Binary PCM chunk (16kHz 16-bit mono)
        if (typeof data !== "string") {
          const bytes = new Uint8Array(data);
          let binary = "";
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]!);
          }
          const b64 = btoa(binary);
          trySend(
            geminiWs,
            JSON.stringify({
              realtimeInput: {
                mediaChunks: [
                  {
                    mimeType: "audio/pcm;rate=16000",
                    data: b64,
                  },
                ],
              },
            }),
          );
        } else if (typeof data === "string" && data.startsWith("{")) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "audio" && parsed.data) {
              trySend(
                geminiWs,
                JSON.stringify({
                  realtimeInput: {
                    mediaChunks: [
                      {
                        mimeType: "audio/pcm;rate=16000",
                        data: parsed.data,
                      },
                    ],
                  },
                }),
              );
            } else if (parsed.type === "stop") {
              trySend(
                geminiWs,
                JSON.stringify({
                  clientContent: {
                    turns: [],
                    turnComplete: true,
                  },
                }),
              );
            }
          } catch {}
        }
      });

      server.addEventListener("close", () => {
        if (geminiWs) {
          try {
            geminiWs.close(1000);
          } catch {}
        }
      });

      return createWebSocketResponse(client);
    }

    // ==========================================
    // OPTION B: Cloud Run bridge (Speech V2 / chirp_3)
    // ==========================================
    let bridgeWs: WebSocket | null = null;
    try {
      const bridgeResp = (await fetch(bridgeUrl!, {
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
        server.close(1011, "bridge_connect_failed");
        return createWebSocketResponse(client);
      }
      bridgeWs = bridgeResp.webSocket;
      try {
        (bridgeWs as unknown as { accept?: () => void }).accept?.();
      } catch {}
    } catch {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_connect_failed" }));
      server.close(1011, "bridge_connect_failed");
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
            (msg as Record<string, unknown>).t_worker_first_partial = tFirstPartial;
            (msg as Record<string, unknown>).latency_worker_to_first_partial =
              tFirstPartial - tWorkerOpen;
          }
          trySend(server, JSON.stringify(msg));
          return;
        } catch {}
      }
      if (typeof raw === "string") trySend(server, raw);
      else trySend(server, raw as ArrayBuffer);
    };
    const bridgeOnClose = () => {
      try {
        server.close(1000);
      } catch {}
    };
    const bridgeOnError = () => {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_error" }));
      try {
        server.close(1011);
      } catch {}
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
        } catch {}
      }
    });
    server.addEventListener("close", () => {
      if (bridgeWs) {
        try {
          bridgeWs.close();
        } catch {}
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
