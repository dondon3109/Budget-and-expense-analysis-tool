import { transactionVoiceDraftSchema, type TransactionVoiceDraft } from "@zoption/shared";
import { File } from "expo-file-system";

import { publicConfig } from "@/config/public-config";
import { discardTemporarySourceFile } from "@/files/temporary-source-file";

import { fetchMultipartWithTimeout } from "./assistant-voice";
import { ApiTransportError, mapApiError } from "./authenticated";

const entryFallback = "AI entry could not be reached. Try again shortly.";

export interface AiEntryRecording {
  uri: string;
  fileName: string;
}

/** Uploads one temporary voice clip and returns a review-only transaction draft. */
export async function extractVoiceTransaction(
  accessToken: string,
  recording: AiEntryRecording,
  fetchImpl: typeof fetch = fetch,
): Promise<TransactionVoiceDraft> {
  const form = new FormData();
  try {
    form.append("audio", new File(recording.uri) as unknown as Blob, recording.fileName);
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
        headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
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
