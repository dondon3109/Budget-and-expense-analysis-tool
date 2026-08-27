import type { Bindings } from "../types";
import {
  AssistantVoiceProviderError,
  type AssistantVoiceTranscriptionProvider,
} from "./voice-provider";

/**
 * Google Cloud Speech-to-Text V2 - REST Recognize (short audio, <60s)
 * Dedicated STT provider for chirp_3. NOT Gemini Live.
 *
 * Spike conclusion (2026-08-27): StreamingRecognize is gRPC-only and NOT viable
 * directly in Cloudflare Workers (Workers lack Node http2/gRPC). This adapter
 * uses REST `Recognize` (HTTP/JSON) which works in Workers for short utterances.
 * Full realtime streaming will require a proxy (e.g., Cloud Run gRPC bridge) or
 * use of Gemini Live WebSocket as a separate provider. See spike:
 * apps/api/tests/spike-google-grpc.test.ts
 *
 * Credential model (encrypted at rest, per spec #13):
 * - Encrypted secret is opaque JSON or token string.
 * - For V2, recommend JSON: `{"projectId":"my-project","location":"us","accessToken":"ya29..."}`
 * - Legacy: raw Bearer token or API key (if using Gemini path, not here)
 * - This adapter parses JSON to extract projectId/location/token.
 */

const DEFAULT_LOCATION = "us";
const REST_RECOGNIZE_TIMEOUT_MS = 30_000;

function parseGoogleSecret(secret: string): {
  projectId: string | null;
  location: string;
  token: string;
} {
  const trimmed = secret.trim();
  // Try JSON
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object") {
      const projectId =
        typeof obj.projectId === "string"
          ? obj.projectId
          : typeof obj.project_id === "string"
            ? obj.project_id
            : null;
      const token =
        typeof obj.apiKey === "string"
          ? obj.apiKey
          : typeof obj.api_key === "string"
            ? obj.api_key
            : typeof obj.key === "string"
              ? obj.key
              : typeof obj.accessToken === "string"
                ? obj.accessToken
                : typeof obj.token === "string"
                  ? obj.token
                  : trimmed;
      const location = typeof obj.location === "string" ? obj.location : DEFAULT_LOCATION;
      return { projectId, location, token };
    }
  } catch {
    // not JSON, treat as raw token or API key
  }
  return { projectId: null, location: DEFAULT_LOCATION, token: trimmed };
}

function timeoutMs(env: Bindings): number {
  const v = Number(env.ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(v) && v >= 5_000 && v <= 60_000 ? v : REST_RECOGNIZE_TIMEOUT_MS;
}

export function createGoogleSttProvider(
  model: string = "gemini-3.5-transcribe",
  apiKeyOverride?: string,
): AssistantVoiceTranscriptionProvider {
  return {
    async transcribe(env, audio) {
      const secret = apiKeyOverride?.trim() || "";
      if (!secret) throw new AssistantVoiceProviderError("google" as any, "configuration");

      const { projectId, location, token } = parseGoogleSecret(secret);
      if (!token) throw new AssistantVoiceProviderError("google" as any, "configuration");

      const effectiveModel = model?.trim() || "gemini-3.5-transcribe";
      const arrayBuf = await audio.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const b64 = btoa(binary);
      const audioMime = audio.type?.trim() || "audio/webm";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs(env));

      try {
        // Gemini transcription path (e.g. gemini-3.5-transcribe, gemini-3.5-transcribe-live)
        if (effectiveModel.startsWith("gemini")) {
          const isApiKey = token.startsWith("AIza") || !token.startsWith("ya29");
          const endpoint = isApiKey
            ? `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${encodeURIComponent(token)}`
            : `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent`;

          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (!isApiKey) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: "Transcribe this audio verbatim. Return only the exact transcribed words and punctuation with no explanation, timestamps, or quotes.",
                    },
                    { inlineData: { mimeType: audioMime, data: b64 } },
                  ],
                },
              ],
              generationConfig: { temperature: 0.0 },
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            if (res.status === 401 || res.status === 403)
              throw new AssistantVoiceProviderError("google" as any, "configuration", res.status);
            if (res.status === 429)
              throw new AssistantVoiceProviderError("google" as any, "rate_limit", res.status);
            if (res.status >= 500)
              throw new AssistantVoiceProviderError("google" as any, "unavailable", res.status);
            throw new AssistantVoiceProviderError("google" as any, "invalid_response", res.status);
          }

          const data = (await res.json().catch(() => null)) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          } | null;
          const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          if (!transcript)
            throw new AssistantVoiceProviderError("google" as any, "invalid_response");
          return { text: transcript, durationSeconds: 0, languageCode: "en-US" };
        }

        // Speech-to-Text V2 / chirp_3 path
        const effectiveProjectId =
          projectId ||
          (env as unknown as Record<string, string | undefined>).GOOGLE_CLOUD_PROJECT ||
          (env as unknown as Record<string, string | undefined>).GCP_PROJECT_ID ||
          null;

        if (effectiveProjectId) {
          const isApiKey = token.startsWith("AIza");
          const endpoint = isApiKey
            ? `https://speech.googleapis.com/v2/projects/${effectiveProjectId}/locations/${location}/recognizers/_:recognize?key=${encodeURIComponent(token)}`
            : `https://speech.googleapis.com/v2/projects/${effectiveProjectId}/locations/${location}/recognizers/_:recognize`;

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-goog-user-project": effectiveProjectId,
          };
          if (!isApiKey) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              config: {
                autoDecodingConfig: {},
                languageCodes: ["en-US"],
                model: effectiveModel,
              },
              content: b64,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            if (res.status === 401 || res.status === 403)
              throw new AssistantVoiceProviderError("google" as any, "configuration", res.status);
            if (res.status === 429)
              throw new AssistantVoiceProviderError("google" as any, "rate_limit", res.status);
            if (res.status >= 500)
              throw new AssistantVoiceProviderError("google" as any, "unavailable", res.status);
            throw new AssistantVoiceProviderError("google" as any, "invalid_response", res.status);
          }
          const data = (await res.json().catch(() => null)) as {
            results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
          } | null;
          const transcript = data?.results?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
          if (!transcript)
            throw new AssistantVoiceProviderError("google" as any, "invalid_response");
          return { text: transcript, durationSeconds: 0, languageCode: "en-US" };
        }

        // Fallback for raw API key without projectId using Speech V1
        if (token.startsWith("AIza")) {
          const endpoint = `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(token)}`;
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: {
                languageCode: "en-US",
                model: "latest_long",
              },
              audio: { content: b64 },
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            if (res.status === 401 || res.status === 403)
              throw new AssistantVoiceProviderError("google" as any, "configuration", res.status);
            if (res.status === 429)
              throw new AssistantVoiceProviderError("google" as any, "rate_limit", res.status);
            if (res.status >= 500)
              throw new AssistantVoiceProviderError("google" as any, "unavailable", res.status);
            throw new AssistantVoiceProviderError("google" as any, "invalid_response", res.status);
          }
          const data = (await res.json().catch(() => null)) as {
            results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
          } | null;
          const transcript = data?.results?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
          if (!transcript)
            throw new AssistantVoiceProviderError("google" as any, "invalid_response");
          return { text: transcript, durationSeconds: 0, languageCode: "en-US" };
        }

        // Without projectId or valid API key, fail as configuration error
        throw new AssistantVoiceProviderError("google" as any, "configuration");
      } catch (e) {
        if (e instanceof AssistantVoiceProviderError) throw e;
        if (controller.signal.aborted)
          throw new AssistantVoiceProviderError("google" as any, "timeout");
        throw new AssistantVoiceProviderError("google" as any, "unavailable");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
