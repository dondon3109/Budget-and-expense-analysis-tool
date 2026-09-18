// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import {
  createGoogleSttProvider,
  isGoogleGenerativeLanguageApiKey,
} from "../src/assistant/google-stt";
import { AssistantVoiceProviderError } from "../src/assistant/voice-provider";

describe("isGoogleGenerativeLanguageApiKey", () => {
  it("accepts standard AIza keys and AI Studio Auth keys", () => {
    expect(isGoogleGenerativeLanguageApiKey("AIzaSyFakeGoogleApiKey1234567890")).toBe(true);
    expect(isGoogleGenerativeLanguageApiKey("AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ")).toBe(
      true,
    );
    expect(isGoogleGenerativeLanguageApiKey("  AQ.AbFakeAuthKey  ")).toBe(true);
  });

  it("rejects OAuth tokens, JSON, and empty values", () => {
    expect(isGoogleGenerativeLanguageApiKey("")).toBe(false);
    expect(isGoogleGenerativeLanguageApiKey("ya29.a0AFakeOauthToken")).toBe(false);
    expect(isGoogleGenerativeLanguageApiKey('{"type":"service_account"}')).toBe(false);
  });
});

describe("createGoogleSttProvider", () => {
  it("transcribes via Gemini endpoint when model starts with gemini", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedBody: any = null;
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      interceptedUrl = String(url);
      interceptedBody = JSON.parse(init.body);
      interceptedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Spent fifty pesos at Jollibee" }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const provider = createGoogleSttProvider("gemini-3.5-transcribe", "AIzaSySecretVoiceKey9999");
      const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any);

      expect(interceptedUrl).toContain("generativelanguage.googleapis.com");
      expect(interceptedUrl).toContain("gemini-3.5-transcribe:generateContent");
      expect(interceptedUrl).not.toContain("key=");
      expect(interceptedHeaders["x-goog-api-key"]).toBe("AIzaSySecretVoiceKey9999");
      expect(interceptedBody.contents[0].parts[1].inlineData.mimeType).toBe("audio/webm");
      expect(interceptedBody.contents[0].parts[0].text).toContain("in English");
      expect(res.text).toBe("Spent fifty pesos at Jollibee");
      expect(res.languageCode).toBe("en-US");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses Tagalog prompt and languageCode fil-PH when language is fil on Gemini endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBody: any = null;

    globalThis.fetch = vi.fn(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Nagbayad ng limampung piso" }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const provider = createGoogleSttProvider("gemini-3.5-transcribe", "AIzaSySecretVoiceKey9999");
      const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any, { language: "fil" });

      expect(interceptedBody.contents[0].parts[0].text).toContain("Tagalog, Filipino");
      expect(res.text).toBe("Nagbayad ng limampung piso");
      expect(res.languageCode).toBe("fil-PH");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps gemini-3.5-transcribe-live to gemini-2.0-flash on REST batch endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      interceptedUrl = String(url);
      interceptedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Fallback transcribed speech" }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const provider = createGoogleSttProvider(
        "gemini-3.5-transcribe-live",
        "AIzaSySecretVoiceKey9999",
      );
      const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any);

      expect(interceptedUrl).toContain("generativelanguage.googleapis.com");
      expect(interceptedUrl).toContain("gemini-2.0-flash:generateContent");
      expect(interceptedUrl).not.toContain("key=");
      expect(interceptedHeaders["x-goog-api-key"]).toBe("AIzaSySecretVoiceKey9999");
      expect(res.text).toBe("Fallback transcribed speech");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("supports JSON secret with apiKey and projectId for Speech V2", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      interceptedUrl = String(url);
      interceptedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "Speech V2 transcribed text" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const jsonSecret = JSON.stringify({
        projectId: "test-gcp-project",
        apiKey: "AIzaSyKey1234",
        location: "us",
      });
      const provider = createGoogleSttProvider("chirp_3", jsonSecret);
      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any);

      expect(interceptedUrl).toContain(
        "speech.googleapis.com/v2/projects/test-gcp-project/locations/us/recognizers/_:recognize",
      );
      expect(interceptedUrl).not.toContain("key=");
      expect(interceptedHeaders["x-goog-api-key"]).toBe("AIzaSyKey1234");
      expect(res.text).toBe("Speech V2 transcribed text");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes AI Studio Auth keys via the x-goog-api-key header on Speech V2", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      interceptedUrl = String(url);
      interceptedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "V2 AQ transcribed text" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const jsonSecret = JSON.stringify({
        projectId: "test-gcp-project",
        apiKey: "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
        location: "us",
      });
      const provider = createGoogleSttProvider("chirp_3", jsonSecret);
      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any);

      expect(interceptedUrl).toContain(
        "speech.googleapis.com/v2/projects/test-gcp-project/locations/us/recognizers/_:recognize",
      );
      expect(interceptedUrl).not.toContain("key=");
      expect(interceptedHeaders["x-goog-api-key"]).toBe(
        "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
      );
      expect(interceptedHeaders["Authorization"]).toBeUndefined();
      expect(res.text).toBe("V2 AQ transcribed text");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes raw AI Studio Auth keys via the x-goog-api-key header on Speech V1 fallback", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      interceptedUrl = String(url);
      interceptedHeaders = init.headers;
      return new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "V1 AQ transcribed text" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const provider = createGoogleSttProvider(
        "chirp_3",
        "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
      );
      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any);

      expect(interceptedUrl).toContain("speech.googleapis.com/v1/speech:recognize");
      expect(interceptedUrl).not.toContain("key=");
      expect(interceptedHeaders["x-goog-api-key"]).toBe(
        "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
      );
      expect(res.text).toBe("V1 AQ transcribed text");
      expect(res.languageCode).toBe("en-US");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("configures fil-PH and returns fil-PH on Speech V2 when language is fil", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBody: any = null;

    globalThis.fetch = vi.fn(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "Speech V2 Tagalog text" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const jsonSecret = JSON.stringify({
        projectId: "test-gcp-project",
        apiKey: "AIzaSyKey1234",
        location: "us",
      });
      const provider = createGoogleSttProvider("chirp_3", jsonSecret);
      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any, { language: "fil" });

      expect(interceptedBody.config.languageCodes).toEqual(["fil-PH", "en-US"]);
      expect(res.text).toBe("Speech V2 Tagalog text");
      expect(res.languageCode).toBe("fil-PH");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("configures fil-PH and returns fil-PH on Speech V1 fallback when language is fil", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBody: any = null;

    globalThis.fetch = vi.fn(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "Speech V1 Tagalog text" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    try {
      const provider = createGoogleSttProvider(
        "chirp_3",
        "AQ.AbFakeAuthKeyThatIsLongEnough1234567890r2PQ",
      );
      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
      const res = await provider.transcribe({} as any, audioBlob as any, { language: "fil" });

      expect(interceptedBody.config.languageCode).toBe("fil-PH");
      expect(interceptedBody.config.alternativeLanguageCodes).toEqual(["en-US", "en-PH"]);
      expect(res.text).toBe("Speech V1 Tagalog text");
      expect(res.languageCode).toBe("fil-PH");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws configuration error when no secret provided", async () => {
    const provider = createGoogleSttProvider("gemini-3.5-transcribe", "");
    const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    await expect(provider.transcribe({} as any, audioBlob as any)).rejects.toThrow(
      AssistantVoiceProviderError,
    );
  });
});
