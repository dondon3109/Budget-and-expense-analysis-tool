import {
  receiptConsentUpdateSchema,
  receiptDraftSchema,
  receiptPreferencesResponseSchema,
  type ReceiptDraft,
  type ReceiptPreferences,
} from "@zoption/shared";

import { File } from "expo-file-system";

import { publicConfig } from "@/config/public-config";

import { ApiTransportError, apiRequest, mapApiError } from "./authenticated";
import {
  extractDummyReceipt,
  getDummyReceiptPreferences,
  isDummyAssistantToken,
} from "./assistant-dummy";

export interface ReceiptApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface ReceiptImage {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

const receiptFallback = "Receipt scanning could not be reached. Try again shortly.";
const RECEIPT_EXTRACT_TIMEOUT_MS = 45_000;

export function getReceiptPreferences(api: ReceiptApi): Promise<ReceiptPreferences> {
  if (isDummyAssistantToken(api.accessToken)) {
    return getDummyReceiptPreferences();
  }
  return apiRequest({
    ...api,
    path: "/api/app/receipts/preferences",
    method: "GET",
    fallback: receiptFallback,
    decode: (value) => receiptPreferencesResponseSchema.parse(value),
  });
}

export function grantReceiptConsent(api: ReceiptApi): Promise<ReceiptPreferences> {
  if (isDummyAssistantToken(api.accessToken)) {
    return getDummyReceiptPreferences();
  }
  return apiRequest({
    ...api,
    path: "/api/app/receipts/preferences",
    method: "PATCH",
    body: receiptConsentUpdateSchema.parse({ consented: true }),
    fallback: receiptFallback,
    decode: (value) => receiptPreferencesResponseSchema.parse(value),
  });
}

/**
 * Sends a receipt photo to the Worker, where Cloudflare Workers AI reads the
 * merchant, date, total, kind and a suggested category. The photo is processed
 * in-flight only and is never stored.
 */
export async function extractReceipt(api: ReceiptApi, image: ReceiptImage): Promise<ReceiptDraft> {
  if (isDummyAssistantToken(api.accessToken)) {
    return extractDummyReceipt();
  }
  const form = new FormData();
  // Expo SDK 57's Winter fetch does not support RN's proprietary { uri }
  // FormData parts - it throws "Unsupported FormDataPart implementation".
  // Append an expo-file-system File instead; the Winter runtime converts it
  // through its bytes() contract and carries name/type into the part headers.
  form.append("image", new File(image.uri) as unknown as Blob, image.fileName);
  const fetchImpl = api.fetchImpl ?? fetch;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
  }, RECEIPT_EXTRACT_TIMEOUT_MS);
  let response: Response;
  try {
    // NOTE: intentionally no AbortSignal here. On Android, RN's fetch rejects
    // a FormData upload locally with "Network request failed" before any
    // socket activity when a JS AbortController signal is attached. The
    // server's provider timeout bounds the work; the local timer only fails
    // the UI promise when no response arrives in time.
    response = await fetchImpl(publicConfig.apiUrl + "/api/app/receipts/extract", {
      method: "POST",
      headers: { Authorization: "Bearer " + api.accessToken },
      body: form,
    });
  } catch {
    if (timedOut) {
      throw new ApiTransportError(
        "Reading the receipt is taking too long. Try again with a clearer photo.",
        "network",
        0,
      );
    }
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await response.json().catch(() => ({}))) as never,
      receiptFallback,
    );
  }
  return receiptDraftSchema.parse(await response.json());
}
