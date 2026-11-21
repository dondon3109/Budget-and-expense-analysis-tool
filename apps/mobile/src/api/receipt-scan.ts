import {
  RECEIPT_DRAFT_PAYMENT_DETAIL,
  receiptConsentUpdateSchema,
  receiptDraftSchema,
  receiptPreferencesResponseSchema,
  type ReceiptDraft,
  type ReceiptPreferences,
} from "@zoption/shared";

import { File } from "expo-file-system";

import { telemetry } from "@/telemetry/telemetry";
import { publicConfig } from "@/config/public-config";

import { fetchMultipartWithTimeout } from "./assistant-voice";
import { ApiTransportError, apiRequest, decodeJson, mapApiError } from "./authenticated";
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
  // Asks for e-wallet and bank confirmation details, which this build's draft schema knows.
  form.append("detail", RECEIPT_DRAFT_PAYMENT_DETAIL);
  const fetchImpl = api.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      fetchImpl,
      publicConfig.apiUrl + "/api/app/receipts/extract",
      {
        method: "POST",
        headers: { Accept: "application/json", Authorization: "Bearer " + api.accessToken },
        body: form,
        signal: api.signal,
      },
      RECEIPT_EXTRACT_TIMEOUT_MS,
      "Reading the receipt is taking too long. Try again with a clearer photo.",
    );
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await decodeJson(response).catch(() => ({}))) as never,
      receiptFallback,
    );
  }
  let draft: ReceiptDraft;
  try {
    draft = receiptDraftSchema.parse(await decodeJson(response));
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    throw new ApiTransportError(
      "Zoption returned an unrecognized response.",
      "invalid_response",
      response.status,
    );
  }
  void telemetry.capture("receipt_scanned");
  return draft;
}
