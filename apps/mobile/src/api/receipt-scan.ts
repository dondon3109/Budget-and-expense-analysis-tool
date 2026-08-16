import {
  receiptScanRequestSchema,
  receiptScanResponseSchema,
  type ReceiptScanRequest,
  type ReceiptScanResponse,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

const receiptFallback = "The receipt could not be scanned. Try again with a clearer photo.";

/**
 * Sends a receipt photo to the Worker, where Cloudflare Workers AI reads
 * the merchant, date and total. The image never leaves the request and no
 * receipt is stored.
 */
export function scanReceipt(
  api: { accessToken: string; fetchImpl?: typeof fetch },
  request: ReceiptScanRequest,
): Promise<ReceiptScanResponse> {
  return apiRequest({
    ...api,
    path: "/api/app/imports/receipt-scan",
    method: "POST",
    body: receiptScanRequestSchema.parse(request),
    fallback: receiptFallback,
    decode: (value) => receiptScanResponseSchema.parse(value),
  });
}
