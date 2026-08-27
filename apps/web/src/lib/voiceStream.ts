import type { AuthenticatedWorkspace } from "./workspace";
import { openVoiceStreamWebSocket } from "./api";

export interface LiveTranscriptionCallbacks {
  onPartial: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: Error) => void;
}

export interface LiveTranscriptionSession {
  stop: () => void;
}

/**
 * Starts a real-time live transcription session over WebSocket.
 * Streams 16kHz 16-bit PCM audio chunks to /api/app/assistant/voice/stream
 * and receives real-time partial and final transcripts.
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

  // Use 16kHz sample rate optimal for speech models
  const audioContext = new AudioContextClass({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(mediaStream);
  // Buffer size 4096 at 16kHz is ~256ms per audio chunk
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  let isStopped = false;

  const cleanup = () => {
    if (isStopped) return;
    isStopped = true;
    try {
      source.disconnect();
      processor.disconnect();
    } catch {}
    if (audioContext.state !== "closed") {
      void audioContext.close().catch(() => {});
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close(1000);
      } catch {}
    }
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
      } else if (msg.type === "final" && typeof msg.transcript === "string") {
        callbacks.onFinal(msg.transcript);
      } else if (msg.type === "error") {
        callbacks.onError?.(new Error(msg.message || "Live transcription error."));
      }
    } catch {}
  });

  ws.addEventListener("error", () => {
    callbacks.onError?.(new Error("Voice stream WebSocket error."));
    cleanup();
  });

  ws.addEventListener("close", () => {
    cleanup();
  });

  // Stream PCM chunks
  processor.onaudioprocess = (event) => {
    if (isStopped || ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    try {
      ws.send(pcm16.buffer);
    } catch {}
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop() {
      if (isStopped) return;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "stop" }));
        }
      } catch {}
      // Allow a brief grace period for any in-flight final transcript before full teardown
      setTimeout(() => {
        cleanup();
      }, 400);
    },
  };
}
