import { AudioModule } from "expo-audio";
import { publicConfig } from "@/config/public-config";

export interface MobileVoiceStreamCallbacks {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: Error) => void;
  onAutoStop?: () => void;
  onLatency?: (metrics: {
    t_worker_first_partial: number;
    latency_worker_to_first_partial: number;
  }) => void;
}

export interface MobileVoiceStreamOptions {
  /** Continuous silence that ends the recording (default 2000ms). */
  silenceMs?: number;
  /** Never auto-stop before this long (default 2000ms). */
  minRecordMs?: number;
  /** Fallback silence threshold before noise-floor calibration (default 500). */
  silenceRms?: number;
}

export const MOBILE_VOICE_SILENCE_MS = 3000;
export const MOBILE_VOICE_MIN_RECORD_MS = 1500;
export const MOBILE_VOICE_SILENCE_RMS = 600;
/** First buffers calibrate the mic noise floor (min RMS in this window). */
export const MOBILE_VOICE_CALIBRATION_MS = 750;

/** Root-mean-square energy of int16 PCM, used as a cheap silence meter. */
export function pcmRms(data: ArrayBuffer): number {
  const count = Math.floor(data.byteLength / 2);
  if (count === 0) return 0;
  const samples = new Int16Array(data, 0, count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const s = samples[i]!;
    sum += s * s;
  }
  return Math.sqrt(sum / count);
}

/**
 * Linear-interpolation resampler for int16 PCM mono. Hardware that ignores
 * the 16kHz request (48kHz is common) would otherwise arrive tagged as 16kHz
 * and transcribe as slowed-down speech, so every buffer is normalized before
 * sending. Returns the input buffer untouched when already at target rate.
 */
export function resamplePcmInt16(data: ArrayBuffer, fromRate: number, toRate = 16000): ArrayBuffer {
  const count = Math.floor(data.byteLength / 2);
  if (count === 0 || fromRate === toRate || fromRate <= 0) return data;
  const input = new Int16Array(data, 0, count);
  const ratio = fromRate / toRate;
  const output = new Int16Array(Math.floor(count / ratio));
  for (let i = 0; i < output.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s0 = input[i0]!;
    const s1 = i0 + 1 < input.length ? input[i0 + 1]! : s0;
    output[i] = Math.round(s0 + (s1 - s0) * frac);
  }
  return output.buffer as ArrayBuffer;
}

export interface MobileVoiceStreamSession {
  stop: () => Promise<string | null>;
  cancel: () => void;
  /** True only when mic audio is actually streaming over an open WebSocket. */
  live: boolean;
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
  console.warn("[voice] connecting ws to", wsUrl);
  return new WebSocket(wsUrl);
}

/**
 * Initiates a real-time live streaming audio session on mobile.
 * Uses native AudioStream (16kHz 16-bit PCM mono) and streams frames
 * over a WebSocket connection to /api/app/assistant/voice/stream.
 *
 * Dummy dev sessions stream too: the local dev Worker accepts
 * `dummy-dev-access-token`, so the Dev build gets real partials against the
 * active STT model. (Production rejects dummy tokens at the handshake, which
 * falls through to the no-op batch fallback below.)
 *
 * If native AudioStream is not available (old Expo Go, web), returns a
 * no-op session so the caller can fall back to batch file upload without
 * opening a wasted WebSocket. No-op sessions report `live: false` so the UI
 * can say live preview is off instead of staying silent.
 *
 * Silence auto-stop: PCM energy (int16 RMS) is metered on every buffer and
 * `onAutoStop` fires once after `silenceMs` of continuous silence past
 * `minRecordMs`, so the caller can stop and transcribe without a tap.
 */
export async function startMobileVoiceStream(
  accessToken: string,
  callbacks: MobileVoiceStreamCallbacks,
  options: MobileVoiceStreamOptions = {},
): Promise<MobileVoiceStreamSession> {
  // Fast path: no native streaming support — let batch recorder handle it
  if (typeof AudioModule?.AudioStream !== "function") {
    return {
      stop: async () => null,
      cancel: () => {},
      live: false,
    };
  }

  let latestTranscript: string | null = null;
  let isStopped = false;
  let ws: WebSocket | null = null;
  let stream: {
    start: () => Promise<void>;
    stop: () => void;
    addListener: (
      event: string,
      cb: (buf: { data: ArrayBuffer; sampleRate?: number }) => void,
    ) => { remove: () => void };
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
        const targetUrl = ws?.url ?? "";
        const isLocalHost = targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost");
        if (typeof __DEV__ !== "undefined" && __DEV__ && isLocalHost) {
          console.warn(
            `[voice] WebSocket connection failed to ${targetUrl}. If testing on an Android device via USB, run 'adb reverse tcp:8787 tcp:8787'.`,
          );
        }
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

    let resetSilenceTrigger: (() => void) | null = null;

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
          if (msg.transcript.trim().length > 0) {
            resetSilenceTrigger?.();
          }
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
          if (msg.transcript.trim().length > 0) {
            resetSilenceTrigger?.();
          }
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
                ? msg.message ||
                  "Live transcription not configured. Activate gemini-3.5-transcribe-live with an API key."
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
      stream = new (
        AudioModule.AudioStream as unknown as new (opts: {
          sampleRate: number;
          channels: number;
          encoding: string;
        }) => typeof stream
      )({
        sampleRate: 16000,
        channels: 1,
        encoding: "int16",
      } as never);

      const silenceMsTarget = options.silenceMs ?? MOBILE_VOICE_SILENCE_MS;
      const minRecordMs = options.minRecordMs ?? MOBILE_VOICE_MIN_RECORD_MS;
      const fallbackRms = options.silenceRms ?? MOBILE_VOICE_SILENCE_RMS;
      let silenceAccumMs = 0;
      let consecutiveSpeechMs = 0;
      let autoStopFired = false;
      let streamStartMs = 0;
      let noiseFloor: number | null = null;
      let lastVadLogMs = 0;
      const speechDebounceMs = Math.min(200, silenceMsTarget / 2);

      resetSilenceTrigger = () => {
        consecutiveSpeechMs = 0;
        silenceAccumMs = 0;
      };

      bufferSub = stream!.addListener("audioStreamBuffer", (buffer) => {
        if (isStopped || !buffer?.data) return;
        // Meter silence first so a dead socket still ends the take.
        if (!autoStopFired && streamStartMs > 0) {
          const rms = pcmRms(buffer.data);
          const elapsedMs = Date.now() - streamStartMs;
          const rate = buffer.sampleRate && buffer.sampleRate > 0 ? buffer.sampleRate : 16000;
          const bufferDurationMs = (buffer.data.byteLength / 2 / rate) * 1000;

          // Calibrate to this mic: fixed thresholds misfire across devices
          // (a noisy mic idles above them and never stops; too low cuts speech).
          if (elapsedMs < MOBILE_VOICE_CALIBRATION_MS) {
            noiseFloor = noiseFloor === null ? rms : Math.min(noiseFloor, rms);
          }
          // Floor of 600 RMS prevents ambient room noise (fans, air conditioning, breathing)
          // from being misclassified as speech.
          const threshold =
            noiseFloor === null ? fallbackRms : Math.min(3000, Math.max(600, noiseFloor * 2.5));

          if (rms >= threshold) {
            consecutiveSpeechMs += bufferDurationMs;
            // Require sustained audio above threshold before resetting silence counter.
            // Brief spikes (keyboard, breathing, clicks < speechDebounceMs) are ignored.
            if (consecutiveSpeechMs >= speechDebounceMs) {
              silenceAccumMs = 0;
            }
          } else {
            consecutiveSpeechMs = 0;
            silenceAccumMs += bufferDurationMs;
          }

          if (Date.now() - lastVadLogMs >= 1000) {
            lastVadLogMs = Date.now();
            if (typeof console !== "undefined" && console.debug) {
              console.debug("[voice] mobile VAD", {
                rms: Math.round(rms),
                threshold: Math.round(threshold),
                silenceMs: Math.round(silenceAccumMs),
                sampleRate: buffer.sampleRate ?? "unknown",
              });
            }
          }
          if (silenceAccumMs >= silenceMsTarget && elapsedMs >= minRecordMs) {
            autoStopFired = true;
            console.warn("[voice] mobile autoStop fired, silenceMs=", Math.round(silenceAccumMs));
            try {
              callbacks.onAutoStop?.();
            } catch {}
          }
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Normalize to 16kHz: sending 48kHz audio tagged as 16kHz transcribes
        // as slowed-down speech.
        const actualRate = buffer.sampleRate && buffer.sampleRate > 0 ? buffer.sampleRate : 16000;
        const payload =
          actualRate === 16000 ? buffer.data : resamplePcmInt16(buffer.data, actualRate);
        const pcmBase64 = arrayBufferToBase64(payload);
        try {
          ws.send(JSON.stringify({ type: "audio", pcm: pcmBase64, data: pcmBase64 }));
        } catch {}
      });

      await stream!.start();
      streamStartMs = Date.now();
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
        live: false,
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
      live: false,
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
    live: true,
  };
}
