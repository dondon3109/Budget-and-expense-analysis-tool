import { AudioModule } from "expo-audio";
import { publicConfig } from "@/config/public-config";

export interface MobileVoiceStreamCallbacks {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: Error) => void;
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
 */
export async function startMobileVoiceStream(
  accessToken: string,
  callbacks: MobileVoiceStreamCallbacks,
): Promise<MobileVoiceStreamSession> {
  let latestTranscript: string | null = null;
  let isStopped = false;
  let ws: WebSocket | null = null;
  let stream: {
    start: () => Promise<void>;
    stop: () => void;
    addListener: (event: string, cb: (buf: { data: ArrayBuffer }) => void) => { remove: () => void };
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
      const onError = (e: unknown) => {
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

    // Listen for incoming transcripts
    ws.addEventListener("message", (event: { data: unknown }) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          transcript?: string;
          isFinal?: boolean;
          message?: string;
        };
        if (msg.type === "partial" && typeof msg.transcript === "string") {
          latestTranscript = msg.transcript;
          callbacks.onPartial(msg.transcript);
        } else if (msg.type === "final" && typeof msg.transcript === "string") {
          latestTranscript = msg.transcript;
          callbacks.onFinal(msg.transcript);
        }
      } catch {}
    });

    // Initialize native AudioStream if supported by the native runtime
    if (typeof AudioModule?.AudioStream === "function") {
      try {
        // 16kHz mono 16-bit integer PCM is optimal for Gemini Live API
        stream = new (AudioModule.AudioStream as any)({
          sampleRate: 16000,
          channels: 1,
          encoding: "int16",
        });

        bufferSub = stream!.addListener("audioStreamBuffer", (buffer) => {
          if (isStopped || !ws || ws.readyState !== WebSocket.OPEN) return;
          if (!buffer?.data) return;
          const pcmBase64 = arrayBufferToBase64(buffer.data);
          try {
            ws.send(JSON.stringify({ type: "audio", pcm: pcmBase64, data: pcmBase64 }));
          } catch {}
        });

        await stream!.start();
      } catch (err) {
        // If native AudioStream fails to initialize, stream remains null and
        // the session gracefully relies on the standard recorder fallback.
        if (bufferSub) {
          try {
            bufferSub.remove();
          } catch {}
          bufferSub = null;
        }
        stream = null;
      }
    }
  } catch (error) {
    cleanup();
    if (callbacks.onError && error instanceof Error) {
      callbacks.onError(error);
    }
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
      // Give 150ms for any in-flight final transcript packet
      if (ws && ws.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 150));
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
