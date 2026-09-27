import { transactionVoiceDraftSchema } from "@zoption/shared";
import type { VoiceLanguage, TransactionVoiceDraft } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, apiErrorPayload } from "./errors";
import { workspaceFetch } from "./transport";

/** Uploads one temporary voice clip or submits a transcribed voice text and returns a review-only transaction draft. */
export async function extractVoiceTransaction(
  workspace: AuthenticatedWorkspace,
  audioOrTranscript: Blob | { transcript: string },
  categories?: string[],
  language?: VoiceLanguage,
): Promise<TransactionVoiceDraft> {
  const isDirectTranscript =
    !(audioOrTranscript instanceof Blob) &&
    typeof audioOrTranscript === "object" &&
    typeof audioOrTranscript.transcript === "string";

  const requestInit: RequestInit = isDirectTranscript
    ? {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: audioOrTranscript.transcript,
          ...(categories && categories.length > 0 ? { categories } : {}),
        }),
      }
    : (() => {
        const audio = audioOrTranscript as Blob;
        const form = new FormData();
        const extension = audio.type.includes("mp4")
          ? "m4a"
          : audio.type.includes("ogg")
            ? "ogg"
            : "webm";
        form.set("audio", audio, `voice-input.${extension}`);
        form.set("lang", language || "auto");
        if (categories && categories.length > 0) {
          form.set("categories", JSON.stringify(categories));
        }
        return {
          method: "POST",
          headers: { Accept: "application/json" },
          body: form,
        };
      })();

  const response = await workspaceFetch(workspace, "/api/app/entry/voice", requestInit, {
    timeoutMs: 60_000,
  });
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The recording could not be read as a transaction.",
      response.status,
      payload.error ?? "entry_voice_failed",
      payload.details,
    );
  }
  let draft: TransactionVoiceDraft;
  try {
    draft = transactionVoiceDraftSchema.parse(await response.json());
  } catch {
    throw new ApiRequestError(
      "The recording could not be read as a transaction.",
      response.status,
      "entry_voice_failed",
    );
  }
  return draft;
}
