import {
  receiptConsentUpdateSchema,
  receiptDraftSchema,
  receiptPreferencesResponseSchema,
  type ReceiptDraft,
  type ReceiptPreferences,
} from "@zoption/shared";

import { publicConfig } from "@/config/public-config";

import { ApiTransportError, apiRequest, mapApiError } from "./authenticated";

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
  return apiRequest({
    ...api,
    path: "/api/app/receipts/preferences",
    method: "GET",
    fallback: receiptFallback,
    decode: (value) => receiptPreferencesResponseSchema.parse(value),
  });
}

export function grantReceiptConsent(api: ReceiptApi): Promise<ReceiptPreferences> {
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
 * Runs the extraction fetch with a hard timeout so a stalled vision request
 * fails with a clear message instead of leaving the scanner spinner running.
 */
async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, RECEIPT_EXTRACT_TIMEOUT_MS);
  const externalSignal = init.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (timedOut) {
        throw new ApiTransportError(
          "Reading the receipt is taking too long. Try again with a clearer photo.",
          "network",
          0,
        );
      }
      throw error;
    }
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Sends a receipt photo to the Worker, where Cloudflare Workers AI reads the
 * merchant, date, total, kind and a suggested category. The photo is processed
 * in-flight only and is never stored.
 */
export async function extractReceipt(
  api: ReceiptApi,
  image: ReceiptImage,
): Promise<ReceiptDraft> {
  const form = new FormData();
  form.append("image", {
    uri: image.uri,
    name: image.fileName,
    type: image.mimeType,
  } as unknown as Blob);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      api.fetchImpl ?? fetch,
      publicConfig.apiUrl + "/api/app/receipts/extract",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${api.accessToken}` },
        body: form,
        signal: api.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw error;
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
