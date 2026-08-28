import { AudioModule } from "expo-audio";
import { publicConfig } from "@/config/public-config";

export interface MobileVoiceStreamCallbacks {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: Error) => void;
  onLatency?: (metrics: { t_worker_first_partial: number; latency_worker_to_first_partial: number }) => void;
}

export interface MobileVoiceStreamSession {
  stop: () => Promise<string | null>;
  cancel: () => void;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = "";
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    output += chars[b0 >> 2]!;
    output += chars[((b0 & 3) << 4) | (b1 >> 4)]!;
    output += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)]! : "=";
    output += i + 2 < len ? chars[b2 & 63]! : "=";
  }
  return output;
}

export function openMobileVoiceStreamWebSocket(accessToken: string): WebSocket {
  const base = publicConfig.apiUrl.replace(/^http/, "ws");
  const wsUrl = `${base}/api/app/assistant/voice/stream?token=${encodeURIComponent(accessToken)}`;
  return new WebSocket(wsUrl);
}

/**
 * Initiates a real-time live streaming audio session on mobile.
 * Uses native AudioStream (16kHz 16-bit PCM mono) and streams frames
 * over a WebSocket connection to /api/app/assistant/voice/stream.
 *
 * If native AudioStream is not available (old Expo Go, web), returns a
 * no-op session so the caller can fall back to batch file upload without
 * opening a wasted WebSocket.
 */
export async function startMobileVoiceStream(
  accessToken: string,
  callbacks: MobileVoiceStreamCallbacks,
): Promise<MobileVoiceStreamSession> {
  // Fast path: no native streaming support — let batch recorder handle it
  if (typeof AudioModule?.AudioStream !== "function") {
    return {
      stop: async () => null,
      cancel: () => {},
    };
  }

  let latestTranscript: string | null = null;
  let isStopped = false;
  let ws: WebSocket | null = null;
  let stream: {
    start: () => Promise<void>;
    stop: () => void;
    addListener: (event: string, cb: (buf: { data: ArrayBuffer; sampleRate?: number }) => void) => { remove: () => void };
  } | null = null;
  let bufferSub: { remove: () => void } | null = null;

  const cleanup = () => {
    if (isStopped) return;
    isStopped = true;
    if (bufferSub) {
      try {
        bufferSub.remove();
      } catch {}
      bufferSub = null;
    }
    if (stream) {
      try {
        stream.stop();
      } catch {}
      stream = null;
    }
    if (ws) {
      try {
        ws.close(1000);
      } catch {}
      ws = null;
    }
  };

  try {
    ws = openMobileVoiceStreamWebSocket(accessToken);

    // Wait for connection or early failure
    await new Promise<void>((resolve, reject) => {
      if (!ws) return reject(new Error("WebSocket not initialized."));
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      const onOpen = () => {
        removeListeners();
        resolve();
      };
      const onError = () => {
        removeListeners();
        reject(new Error("WebSocket connection to voice stream failed."));
      };
      const onClose = (e: { code: number }) => {
        removeListeners();
        reject(new Error(`WebSocket closed before open (${e.code}).`));
      };
      const removeListeners = () => {
        if (!ws) return;
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    });

    // Listen for incoming transcripts (with latency instrumentation from worker)
    const handleMessage = (event: { data: unknown }) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          transcript?: string;
          isFinal?: boolean;
          message?: string;
          code?: string;
          t_worker_first_partial?: number;
          latency_worker_to_first_partial?: number;
        };
        if (msg.type === "partial" && typeof msg.transcript === "string") {
          latestTranscript = msg.transcript;
          callbacks.onPartial(msg.transcript);
          if (
            typeof msg.t_worker_first_partial === "number" &&
            typeof msg.latency_worker_to_first_partial === "number"
          ) {
            callbacks.onLatency?.({
              t_worker_first_partial: msg.t_worker_first_partial,
              latency_worker_to_first_partial: msg.latency_worker_to_first_partial,
            });
          }
        } else if (msg.type === "final" && typeof msg.transcript === "string") {
          latestTranscript = msg.transcript;
          callbacks.onFinal(msg.transcript);
          if (
            typeof msg.t_worker_first_partial === "number" &&
            typeof msg.latency_worker_to_first_partial === "number"
          ) {
            callbacks.onLatency?.({
              t_worker_first_partial: msg.t_worker_first_partial,
              latency_worker_to_first_partial: msg.latency_worker_to_first_partial,
            });
          }
        } else if (msg.type === "error") {
          const errorMessage =
            msg.code === "rate_limit" || msg.code === "429"
              ? "Voice mode is busy. Try again shortly."
              : msg.code === "bridge_not_configured" || msg.code === "gemini_missing_key"
                ? msg.message || "Live transcription not configured. Activate gemini-3.5-transcribe-live with an API key."
                : msg.message || "Live transcription error.";
          const err = new Error(errorMessage);
          (err as unknown as Record<string, unknown>).code = msg.code;
          callbacks.onError?.(err);
        }
      } catch {}
    };
    ws.addEventListener("message", handleMessage as unknown as EventListener);

    const handleWsError = () => {
      callbacks.onError?.(new Error("Voice stream WebSocket error."));
      cleanup();
    };
    const handleWsClose = () => {
      cleanup();
    };
    ws.addEventListener("error", handleWsError as unknown as EventListener);
    ws.addEventListener("close", handleWsClose as unknown as EventListener);

    // Initialize native AudioStream (16kHz mono 16-bit PCM is optimal for Gemini Live)
    try {
      stream = new (AudioModule.AudioStream as unknown as new (opts: { sampleRate: number; channels: number; encoding: string }) => typeof stream)( {
        sampleRate: 16000,
        channels: 1,
        encoding: "int16",
      } as never);

      bufferSub = stream!.addListener("audioStreamBuffer", (buffer) => {
        if (isStopped || !ws || ws.readyState !== WebSocket.OPEN) return;
        if (!buffer?.data) return;
        // Warn if hardware delivered a different sampleRate (some devices ignore 16k request)
        if (buffer.sampleRate && buffer.sampleRate !== 16000) {
          // Still send — server declares 16000, but mismatch may affect accuracy
        }
        const pcmBase64 = arrayBufferToBase64(buffer.data);
        try {
          ws.send(JSON.stringify({ type: "audio", pcm: pcmBase64, data: pcmBase64 }));
        } catch {}
      });

      await stream!.start();
    } catch (err) {
      // Native AudioStream failed (permission, hardware busy) — close WS and let batch fallback
      if (bufferSub) {
        try {
          bufferSub.remove();
        } catch {}
        bufferSub = null;
      }
      stream = null;
      // Don't keep a silent WebSocket open with no audio — close it so caller knows to fallback
      try {
        ws.close(1000);
      } catch {}
      ws = null;
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onError?.(new Error(`AudioStream failed: ${msg}`));
      // Return a no-op session that yields no transcript so batch upload will be used
      return {
        stop: async () => null,
        cancel: () => {},
      };
    }
  } catch (error) {
    cleanup();
    if (callbacks.onError && error instanceof Error) {
      callbacks.onError(error);
    }
    // Return no-op so batch fallback can proceed without throwing
    return {
      stop: async () => latestTranscript,
      cancel: () => cleanup(),
    };
  }

  return {
    stop: async () => {
      if (isStopped) return latestTranscript;
      if (bufferSub) {
        try {
          bufferSub.remove();
        } catch {}
        bufferSub = null;
      }
      if (stream) {
        try {
          stream.stop();
        } catch {}
        stream = null;
      }
      // Give 250ms for any in-flight final transcript packet (server grace is 400-600ms)
      if (ws && ws.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          ws.close(1000);
        } catch {}
        ws = null;
      }
      isStopped = true;
      return latestTranscript;
    },
    cancel: () => {
      cleanup();
    },
  };
}
