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

    const response = await fishAudioProvider.synthesize(env, "A safe spoken reply.", "default");
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
    expect(JSON.parse(init.body)).not.toHaveProperty("reference_id");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });

  it("refuses a paid TTS model even if configuration drifts", async () => {
    await expect(
      fishAudioProvider.synthesize({ ...env, FISH_AUDIO_TTS_MODEL: "s2.1" }, "Hello", "default"),
    ).rejects.toMatchObject({ kind: "configuration" });
  });

  it.each([
    ["bright", "ca3007f96ae7499ab87d27ea3599956a"],
    ["energetic", "9a9cf47702da476aa4629e2506d4a857"],
  ] as const)("maps the %s choice to its allowlisted Fish voice", async (voice, referenceId) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(new Uint8Array([1]));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fishAudioProvider.synthesize(env, "Voice preview", voice);

    const init = fetchMock.mock.calls[0]?.[1];
    if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
    expect(JSON.parse(init.body)).toMatchObject({ reference_id: referenceId });
  });
});
