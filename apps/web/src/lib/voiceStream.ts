import type { AuthenticatedWorkspace } from "./workspace";
import { openVoiceStreamWebSocket } from "./api";

export interface LiveTranscriptionCallbacks {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: Error) => void;
  onLatency?: (metrics: { t_worker_first_partial: number; latency_worker_to_first_partial: number }) => void;
}

export const LIVE_FINALIZATION_TIMEOUT_MS = 3000;

export interface LiveTranscriptionSession {
  stop: () => Promise<void>;
}

/**
 * Starts a real-time live transcription session over WebSocket.
 * Streams 16kHz 16-bit PCM audio chunks to /api/app/assistant/voice/stream
 * and receives real-time partial and final transcripts.
 *
 * Uses AudioWorklet when available (Chrome 66+, Safari 14.1+), falls back to
 * ScriptProcessor for older browsers. Never connects the processor to
 * destination to avoid feedback — ScriptProcessor fallback uses a zero-gain
 * stage to keep the node ticking without audible loop.
 */
export async function startLiveTranscriptionSession(
  workspace: AuthenticatedWorkspace,
  mediaStream: MediaStream,
  callbacks: LiveTranscriptionCallbacks,
): Promise<LiveTranscriptionSession> {
  const ws = await openVoiceStreamWebSocket(workspace);

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    ws.close();
    throw new Error("Web Audio API is not supported in this browser.");
  }

  // Try 16kHz (optimal for Gemini Live), fall back to device default if not supported.
  let audioContext: AudioContext;
  try {
    audioContext = new AudioContextClass({ sampleRate: 16000 });
  } catch {
    audioContext = new AudioContextClass();
  }
  // Resume if suspended (autoplay policy)
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {}
  }

  const source = audioContext.createMediaStreamSource(mediaStream);

  let isStopped = false;
  let isStopping = false;
  let hasReceivedFinal = false;
  let workletNode: AudioWorkletNode | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;
  let cleanupTimer: number | undefined;
  let finalizeTimer: number | undefined;
  let finalizeResolver: (() => void) | null = null;
  let stopPromise: Promise<void> | null = null;

  const cleanup = () => {
    if (isStopped) return;
    isStopped = true;
    isStopping = true;
    if (cleanupTimer !== undefined) {
      clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
    }
    if (finalizeTimer !== undefined) {
      clearTimeout(finalizeTimer);
      finalizeTimer = undefined;
    }
    finalizeResolver = null;
    try {
      source.disconnect();
    } catch {}
    try {
      workletNode?.disconnect();
      workletNode?.port.close();
    } catch {}
    try {
      scriptProcessor?.disconnect();
    } catch {}
    try {
      gainNode?.disconnect();
    } catch {}
    workletNode = null;
    scriptProcessor = null;
    gainNode = null;
    if (audioContext.state !== "closed") {
      void audioContext.close().catch(() => {});
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close(1000);
      } catch {}
    }
  };

  const triggerFinalization = () => {
    if (!finalizeResolver) return;
    const resolver = finalizeResolver;
    finalizeResolver = null;
    if (finalizeTimer !== undefined) {
      clearTimeout(finalizeTimer);
      finalizeTimer = undefined;
    }
    cleanup();
    resolver();
  };

  // Wait for WebSocket open or failure
  await new Promise<void>((resolve, reject) => {
    const handleOpen = () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("error", handleError);
      ws.removeEventListener("close", handleClose);
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("WebSocket connection to voice stream failed."));
    };
    const handleClose = (event: CloseEvent) => {
      cleanup();
      reject(new Error(`WebSocket closed before stream opened (${event.code}).`));
    };

    if (ws.readyState === WebSocket.OPEN) {
      resolve();
    } else {
      ws.addEventListener("open", handleOpen);
      ws.addEventListener("error", handleError);
      ws.addEventListener("close", handleClose);
    }
  });

  // Handle incoming transcripts
  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data) as {
        type?: string;
        transcript?: string;
        isFinal?: boolean;
        message?: string;
      };

      if (msg.type === "partial" && typeof msg.transcript === "string") {
        callbacks.onPartial(msg.transcript);
        if (
          typeof (msg as Record<string, unknown>).t_worker_first_partial === "number" &&
          typeof (msg as Record<string, unknown>).latency_worker_to_first_partial === "number"
        ) {
          callbacks.onLatency?.({
            t_worker_first_partial: (msg as Record<string, unknown>).t_worker_first_partial as number,
            latency_worker_to_first_partial: (msg as Record<string, unknown>).latency_worker_to_first_partial as number,
          });
        }
      } else if (msg.type === "final" && typeof msg.transcript === "string") {
        hasReceivedFinal = true;
        callbacks.onFinal(msg.transcript);
        if (
          typeof (msg as Record<string, unknown>).t_worker_first_partial === "number" &&
          typeof (msg as Record<string, unknown>).latency_worker_to_first_partial === "number"
        ) {
          callbacks.onLatency?.({
            t_worker_first_partial: (msg as Record<string, unknown>).t_worker_first_partial as number,
            latency_worker_to_first_partial: (msg as Record<string, unknown>).latency_worker_to_first_partial as number,
          });
        }
        if (isStopping) triggerFinalization();
      } else if (msg.type === "error") {
        const code = (msg as Record<string, unknown>).code as string | undefined;
        const message =
          (msg as Record<string, unknown>).message as string | undefined;
        // Surface 429/503 with actionable text
        const errorMessage =
          code === "rate_limit" || code === "429"
            ? "Voice mode is busy. Try again shortly."
            : code === "bridge_not_configured" || code === "gemini_missing_key"
              ? message || "Live transcription not configured. Activate gemini-3.5-transcribe-live with an API key."
              : message || "Live transcription error.";
        const err = new Error(errorMessage);
        (err as unknown as Record<string, unknown>).code = code;
        callbacks.onError?.(err);
        if (isStopping) triggerFinalization();
      }
    } catch {}
  });

  ws.addEventListener("error", () => {
    callbacks.onError?.(new Error("Voice stream WebSocket error."));
    if (isStopping) triggerFinalization();
    else cleanup();
  });

  ws.addEventListener("close", () => {
    if (isStopping) triggerFinalization();
    else cleanup();
  });

  // Try AudioWorklet first, fall back to ScriptProcessor
  let workletReady = false;
  if (audioContext.audioWorklet) {
    try {
      const workletUrl = new URL("./pcm-worklet.js", import.meta.url);
      await audioContext.audioWorklet.addModule(workletUrl);
      workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (isStopped || isStopping || ws.readyState !== WebSocket.OPEN) return;
        const pcmBuffer = e.data;
        if (!(pcmBuffer instanceof ArrayBuffer) || pcmBuffer.byteLength === 0) return;
        try {
          ws.send(pcmBuffer);
        } catch {}
      };
      workletNode.port.onmessageerror = () => {
        callbacks.onError?.(new Error("Audio worklet message error."));
      };
      source.connect(workletNode);
      // Worklet does not need to be connected to destination to tick
      workletReady = true;
    } catch (err) {
      // Worklet failed (e.g. CSP, old browser), fall through to ScriptProcessor
      try {
        workletNode?.disconnect();
      } catch {}
      workletNode = null;
      workletReady = false;
    }
  }

  if (!workletReady) {
    // ScriptProcessor fallback — keep it alive via zero-gain -> destination
    try {
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    } catch {
      // Very old browsers may not have createScriptProcessor
      cleanup();
      throw new Error("Web Audio processor not available in this browser.");
    }
    scriptProcessor.onaudioprocess = (event) => {
      if (isStopped || isStopping || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      if (!input || input.length === 0) return;
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]!));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      try {
        ws.send(pcm16.buffer);
      } catch {}
    };
    source.connect(scriptProcessor);
    // Keep ScriptProcessor ticking without audible feedback: zero-gain -> destination
    // Some test mocks lack createGain, so fall back to direct destination.
    try {
      const maybeGain = (audioContext as unknown as { createGain?: () => GainNode }).createGain?.();
      if (maybeGain) {
        gainNode = maybeGain;
        gainNode.gain.value = 0;
        scriptProcessor.connect(gainNode);
        gainNode.connect(audioContext.destination);
      } else {
        throw new Error("no gain");
      }
    } catch {
      scriptProcessor.connect(audioContext.destination);
    }
  }

  return {
    stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      if (isStopped) return Promise.resolve();
      isStopping = true;

      // Stop audio streaming immediately but keep WebSocket open for final transcript
      try {
        source.disconnect();
      } catch {}
      try {
        workletNode?.disconnect();
        workletNode?.port.close();
      } catch {}
      try {
        scriptProcessor?.disconnect();
      } catch {}
      try {
        gainNode?.disconnect();
      } catch {}
      workletNode = null;
      scriptProcessor = null;
      gainNode = null;
      if (audioContext.state !== "closed") {
        void audioContext.close().catch(() => {});
      }

      const trySendStop = () => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "stop" }));
            return true;
          }
        } catch {}
        return false;
      };

      if (ws.readyState === WebSocket.OPEN) {
        trySendStop();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        let handled = false;
        const handleOpen = () => {
          if (handled) return;
          handled = true;
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("close", handleCloseBeforeOpen);
          ws.removeEventListener("error", handleErrorBeforeOpen);
          trySendStop();
        };
        const handleCloseBeforeOpen = () => {
          if (handled) return;
          handled = true;
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("close", handleCloseBeforeOpen);
          ws.removeEventListener("error", handleErrorBeforeOpen);
          triggerFinalization();
        };
        const handleErrorBeforeOpen = () => {
          handleCloseBeforeOpen();
        };
        ws.addEventListener("open", handleOpen);
        ws.addEventListener("close", handleCloseBeforeOpen);
        ws.addEventListener("error", handleErrorBeforeOpen);
      } else {
        cleanup();
        return Promise.resolve();
      }

      // If a final already arrived before stop, we already have a transcript.
      // Use a shorter grace to allow trailing final without 3s delay.
      const timeoutMs = hasReceivedFinal ? 800 : LIVE_FINALIZATION_TIMEOUT_MS;
      stopPromise = new Promise<void>((resolve) => {
        finalizeResolver = resolve;
        finalizeTimer = window.setTimeout(() => {
          finalizeResolver = null;
          finalizeTimer = undefined;
          cleanup();
          resolve();
        }, timeoutMs);
      });

      return stopPromise;
    },
  };
}
