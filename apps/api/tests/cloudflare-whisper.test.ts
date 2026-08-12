import { describe, expect, it, vi } from "vitest";

import {
  CLOUDFLARE_WHISPER_MODEL,
  cloudflareWhisperProvider,
} from "../src/assistant/cloudflare-whisper";
import type { Bindings } from "../src/types";

function environment(run: ReturnType<typeof vi.fn>): Bindings {
  return {
    DB: {} as D1Database,
    AI: { run } as unknown as Ai,
    ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS: "30000",
  };
}

describe("Cloudflare Whisper provider", () => {
  it("transcribes base64 audio with VAD and normalizes the result", async () => {
    const run = vi.fn(async () => ({
      text: "  Review   my budget first. ",
      transcription_info: { language: "en", duration: 2.5 },
    }));

    const result = await cloudflareWhisperProvider.transcribe(
      environment(run),
      new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }),
    );

    const call = run.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { signal: unknown },
    ];
    expect(call[0]).toBe(CLOUDFLARE_WHISPER_MODEL);
    expect(call[1]).toEqual({
      audio: "AQID",
      task: "transcribe",
      vad_filter: true,
      condition_on_previous_text: false,
    });
    expect(call[2].signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      text: "Review my budget first.",
      durationSeconds: 2.5,
      languageCode: "en",
    });
  });

  it("fails safely when the Preview AI binding is missing", async () => {
    await expect(
      cloudflareWhisperProvider.transcribe(
        { DB: {} as D1Database },
        new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "configuration" });
  });

  it("rejects an empty provider transcript", async () => {
    const run = vi.fn(async () => ({ text: "   " }));
    await expect(
      cloudflareWhisperProvider.transcribe(
        environment(run),
        new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "invalid_response" });
  });
});
