import { WORKSPACE_HEADER } from "@zoption/shared";
import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";

import { publicConfig } from "@/config/public-config";
import { discardTemporarySourceFile } from "@/files/temporary-source-file";

import { fetchMultipartWithTimeout } from "./assistant-voice";
import { apiRequest, ApiTransportError, decodeJson, mapApiError } from "./authenticated";

// A family entry's receipt photo. It is read only through the signed-in API and held in memory
// while shown, so the phone never keeps a copy of someone else's photo.

interface FamilyApi {
  accessToken: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
}

function receiptPath(transactionId: string): string {
  return `/api/app/family/receipts/${encodeURIComponent(transactionId)}`;
}

function readAsDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The receipt photo could not be read."));
    reader.onerror = () => reject(new Error("The receipt photo could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** The photo as a data URI, or null when the entry has none. Needs a connection. */
export async function fetchFamilyReceipt(
  { accessToken, workspaceId, fetchImpl = fetch }: FamilyApi,
  transactionId: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      fetchImpl,
      publicConfig.apiUrl + receiptPath(transactionId),
      {
        headers: {
          Accept: "image/*",
          Authorization: `Bearer ${accessToken}`,
          [WORKSPACE_HEADER]: workspaceId,
        },
      },
      30_000,
      "The receipt photo took too long to load.",
    );
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    throw new ApiTransportError("Connect to the internet to see the receipt photo.", "network", 0);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await decodeJson(response)) as object,
      "The receipt photo could not be loaded.",
    );
  }
  return readAsDataUri(await response.blob());
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Adds one photo to every entry named, replacing any earlier photo on them. */
export async function uploadFamilyReceipt(
  { accessToken, workspaceId, fetchImpl = fetch }: FamilyApi,
  transactionIds: readonly string[],
  photo: { mimeType: string; base64: string },
): Promise<void> {
  const extension = EXTENSIONS[photo.mimeType] ?? "jpg";
  // RN sends a multipart file only from a path, so the photo passes through the cache briefly.
  const file = new File(Paths.cache, `receipt-upload-${Crypto.randomUUID()}.${extension}`);
  file.write(photo.base64, { encoding: "base64" });
  const form = new FormData();
  for (const transactionId of transactionIds) form.append("transactionId", transactionId);
  form.append("file", file as unknown as Blob, `receipt.${extension}`);
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      fetchImpl,
      `${publicConfig.apiUrl}/api/app/family/receipts`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          [WORKSPACE_HEADER]: workspaceId,
        },
        body: form,
      },
      60_000,
      "The receipt photo took too long to upload.",
      () => discardTemporarySourceFile(file.uri),
    );
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    throw new ApiTransportError("The receipt photo could not be uploaded.", "network", 0);
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await decodeJson(response)) as object,
      "The receipt photo could not be saved.",
    );
  }
}

/** Removes the photo from one entry; the stored image goes once no entry uses it. */
export function removeFamilyReceipt(
  { accessToken, workspaceId, fetchImpl }: FamilyApi,
  transactionId: string,
): Promise<void> {
  return apiRequest({
    accessToken,
    workspaceId,
    fetchImpl,
    path: receiptPath(transactionId),
    method: "DELETE",
    fallback: "The receipt photo could not be removed.",
    decode: () => undefined,
  });
}
