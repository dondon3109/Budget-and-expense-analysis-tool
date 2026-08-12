import { afterEach, describe, expect, it, vi } from "vitest";

import { fishAudioProvider } from "../src/assistant/fish-audio";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  FISH_AUDIO_API_KEY: ["fish", "test", "credential"].join("-"),
  FISH_AUDIO_TTS_MODEL: "s2.1-pro-free",
} satisfies Bindings;

afterEach(() => vi.unstubAllGlobals());

describe("Fish Audio provider", () => {
  it("uses the free TTS model and keeps the API key in the Worker request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await fishAudioProvider.synthesize(env, "A safe spoken reply.");
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect(headers.get("model")).toBe("s2.1-pro-free");
    expect(headers.get("Authorization")).toBe(`Bearer ${env.FISH_AUDIO_API_KEY}`);
    if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
    expect(JSON.parse(init.body)).toMatchObject({
      text: "A safe spoken reply.",
      format: "mp3",
    });
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });

  it("refuses a paid TTS model even if configuration drifts", async () => {
    await expect(
      fishAudioProvider.synthesize({ ...env, FISH_AUDIO_TTS_MODEL: "s2.1" }, "Hello"),
    ).rejects.toMatchObject({ kind: "configuration" });
  });
});
