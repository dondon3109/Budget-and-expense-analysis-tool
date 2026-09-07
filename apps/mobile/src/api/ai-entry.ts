import { transactionVoiceDraftSchema, type TransactionVoiceDraft } from "@zoption/shared";
import { File } from "expo-file-system";

import { publicConfig } from "@/config/public-config";
import { discardTemporarySourceFile } from "@/files/temporary-source-file";

import { fetchMultipartWithTimeout } from "./assistant-voice";
import { ApiTransportError, mapApiError } from "./authenticated";
import { extractDummyVoiceTransaction, isDummyAssistantToken } from "./assistant-dummy";

const entryFallback = "AI entry could not be reached. Try again shortly.";

export interface AiEntryRecording {
  uri: string;
  fileName: string;
}

export interface ExtractVoiceTransactionOptions {
  /**
   * In-flight no-store privacy path: the recording is transcribed without
   * server-side persistence. The temporary file is discarded from this
   * device as soon as the upload settles, the Worker holds the audio in
   * memory only while extracting the draft, and the request advertises
   * `Cache-Control: no-store` plus `X-Zoption-No-Store: 1` so the payload
   * is never cached or stored.
   */
  noStore?: boolean;
  categories?: string[];
}

/** Uploads one temporary voice clip and returns a review-only transaction draft. */
export async function extractVoiceTransaction(
  accessToken: string,
  recording: AiEntryRecording,
  fetchImpl: typeof fetch = fetch,
  optionsOrCategories?: ExtractVoiceTransactionOptions | string[],
  legacyOptions?: ExtractVoiceTransactionOptions,
): Promise<TransactionVoiceDraft> {
  const options: ExtractVoiceTransactionOptions =
    Array.isArray(optionsOrCategories)
      ? { categories: optionsOrCategories, ...(legacyOptions ?? {}) }
      : (optionsOrCategories ?? {});
  const categories = options.categories;
  if (isDummyAssistantToken(accessToken)) {
    discardTemporarySourceFile(recording.uri);
    return extractDummyVoiceTransaction();
  }
  const form = new FormData();
  try {
    form.append("audio", new File(recording.uri) as unknown as Blob, recording.fileName);
    if (categories && categories.length > 0) {
      form.append("categories", JSON.stringify(categories));
    }
  } catch (error) {
    discardTemporarySourceFile(recording.uri);
    throw error;
  }
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      fetchImpl,
      `${publicConfig.apiUrl}/api/app/entry/voice`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          // No-store privacy path: never cache or persist this audio payload.
          ...(options.noStore ? { "Cache-Control": "no-store", "X-Zoption-No-Store": "1" } : {}),
        },
        body: form,
      },
      undefined,
      "AI entry is taking too long. Try again shortly.",
      () => discardTemporarySourceFile(recording.uri),
    );
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    throw new ApiTransportError(entryFallback, "network", 0);
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await response.json().catch(() => ({}))) as never,
      entryFallback,
    );
  }
  return transactionVoiceDraftSchema.parse(await response.json());
}

/** Submits a transcribed voice text directly and returns a review-only transaction draft without audio upload. */
export async function extractVoiceTransactionFromTranscript(
  accessToken: string,
  transcript: string,
  fetchImpl: typeof fetch = fetch,
  categories?: string[],
): Promise<TransactionVoiceDraft> {
  if (isDummyAssistantToken(accessToken)) {
    return extractDummyVoiceTransaction();
  }
  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetchImpl(`${publicConfig.apiUrl}/api/app/entry/voice`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          transcript,
          ...(categories && categories.length > 0 ? { categories } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiTransportError("AI entry is taking too long. Try again shortly.", "network", 0);
    }
    throw new ApiTransportError(entryFallback, "network", 0);
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await response.json().catch(() => ({}))) as never,
      entryFallback,
    );
  }
  return transactionVoiceDraftSchema.parse(await response.json());
}

