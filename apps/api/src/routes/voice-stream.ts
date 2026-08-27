import { Hono } from "hono";

import type { AppEnvironment, Bindings } from "../types";
import { providerRegistry } from "../provider-registry";
import type { PlatformAdminService } from "../platform-admin";

/**
 * Realtime STT WebSocket proxy:
 *   Browser --WSS--> Worker (/api/app/assistant/voice/stream) --WSS--> Cloud Run bridge --gRPC--> Speech V2 chirp_3
 *
 * Auth: same as POST /transcriptions — Supabase JWT via createAuthMiddleware (already mounted on /api/app/*).
 * Active config is global (providerRegistry.getActive('stt')), not per-tenant — affects all users immediately (invalidate).
 * Latency instrumentation: t_mic_start from client header, t_stream_open/first_partial/final from bridge, forwarded to client.
 * No secret forwarded: Google SA stays in Cloud Run ADC (docs/realtime-stt-bridge.md). REST Recognize kept as health-check only.
 */
export function createVoiceStreamRoutes(_platformAdmins?: PlatformAdminService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/stream", async (context) => {
    const upgrade = context.req.header("upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return context.json({ error: "upgrade_required", message: "WebSocket upgrade required." }, 426);
    }

    const env = context.env as Bindings & { STT_BRIDGE_URL?: string };
    const tenant = (context as unknown as { get: (k: string) => { tenantId: string } }).get("tenant");
    const authUser = (context as unknown as { get: (k: string) => { id: string } }).get("authUser");

    // Check active STT config (global)
    const sttCfg = await providerRegistry.getActive(env as Bindings, "stt");
    if (!sttCfg) {
      return context.json({ error: "stt_not_configured", message: "STT provider not configured." }, 503);
    }

    // Non-google (cloudflare) has no realtime streaming — instruct to use POST
    if (sttCfg.provider !== "google") {
      return context.json(
        { error: "stt_not_streaming", message: `Active STT provider ${sttCfg.provider} does not support realtime streaming. Use POST /transcriptions or activate google/chirp_3.` },
        400,
      );
    }

    const bridgeUrl = (env as unknown as Record<string, string | undefined>).STT_BRIDGE_URL?.trim() || env.STT_BRIDGE_URL?.trim();
    if (!bridgeUrl) {
      return context.json({ error: "bridge_not_configured", message: "STT_BRIDGE_URL not configured." }, 503);
    }

    // WebSocketPair is available in workerd
    const pair = new (globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair();
    const client = (pair as unknown as Record<string, WebSocket>)[0] as WebSocket;
    const server = (pair as unknown as Record<string, WebSocket>)[1] as WebSocket;

    // Accept client
    (server as unknown as { accept: () => void }).accept();

    const tWorkerOpen = Date.now();
    let bridgeWs: WebSocket | null = null;
    let tFirstPartial: number | null = null;

    // Helper to forward safely
    const trySend = (ws: WebSocket, data: string | ArrayBuffer) => {
      try {
        if ((ws as unknown as { readyState: number }).readyState === 1) ws.send(data);
      } catch {}
    };

    // Connect to Cloud Run bridge via fetch Upgrade (Workers WebSocket client)
    // Spec: Browser → Worker → Cloud Run → Speech V2 chirp_3 (ADC in Run, no credential forwarded)
    const micStart = context.req.header("x-t-mic-start") || String(tWorkerOpen);
    try {
      const bridgeResp = (await fetch(bridgeUrl, {
        headers: {
          Upgrade: "websocket",
          "x-t-mic-start": micStart,
          "x-zoption-tenant": tenant?.tenantId ? String(tenant.tenantId).slice(0, 8) : "anon",
          "x-zoption-user": authUser?.id ? String(authUser.id).slice(0, 8) : "anon",
        },
      } as unknown as RequestInit)) as unknown as { status: number; webSocket: WebSocket | null; headers: Headers };
      if (bridgeResp.status !== 101 || !bridgeResp.webSocket) {
        trySend(server, JSON.stringify({ type: "error", code: "bridge_connect_failed", status: bridgeResp.status }));
        server.close(1011, "bridge_connect_failed");
        return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
      }
      bridgeWs = bridgeResp.webSocket;
      // Outbound WebSocket from fetch is already accepted in Workers; guard for Node ws fallback
      try {
        (bridgeWs as unknown as { accept?: () => void }).accept?.();
      } catch {}
    } catch {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_connect_failed" }));
      server.close(1011, "bridge_connect_failed");
      return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
    }

    // Bridge → Client (partials/finals with latency, transparent binary/text)
    const bridgeOnMessage = (event: MessageEvent) => {
      const raw = (event as unknown as { data: string | ArrayBuffer }).data;
      if (typeof raw === "string" && raw.startsWith("{")) {
        try {
          const msg = JSON.parse(raw) as Record<string, unknown>;
          if (msg.type === "partial" && tFirstPartial === null) {
            tFirstPartial = Date.now();
            (msg as Record<string, unknown>).t_worker_first_partial = tFirstPartial;
            (msg as Record<string, unknown>).latency_worker_to_first_partial = tFirstPartial - tWorkerOpen;
          }
          trySend(server, JSON.stringify(msg));
          return;
        } catch {}
      }
      // Forward non-JSON or binary verbatim
      if (typeof raw === "string") trySend(server, raw);
      else trySend(server, raw as ArrayBuffer);
    };
    const bridgeOnClose = () => {
      try { server.close(1000); } catch {}
    };
    const bridgeOnError = () => {
      trySend(server, JSON.stringify({ type: "error", code: "bridge_error" }));
      try { server.close(1011); } catch {}
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
          // forward as-is (binary PCM or JSON config)
          bridgeWs.send(data as unknown as string);
        } catch {}
      }
    });
    server.addEventListener("close", () => {
      if (bridgeWs) try { bridgeWs.close(); } catch {}
    });

    // Also need to handle bridgeWs open failure timeout
    setTimeout(() => {
      if (bridgeWs && (bridgeWs as unknown as { readyState: number }).readyState !== 1) {
        trySend(server, JSON.stringify({ type: "error", code: "bridge_timeout" }));
      }
    }, 5000);

    return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
  });

  return routes;
}
