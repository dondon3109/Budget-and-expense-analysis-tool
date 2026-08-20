import type { TransactionKind } from "@zoption/shared";

import type { Bindings } from "../types";

export const DEFAULT_RECEIPT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export type ReceiptVisionProviderName = "cloudflare_workers_ai";
export type ReceiptVisionProviderErrorKind =
  "configuration" | "timeout" | "rate_limit" | "unavailable" | "invalid_response";

export class ReceiptVisionProviderError extends Error {
  constructor(
    readonly provider: ReceiptVisionProviderName,
    readonly kind: ReceiptVisionProviderErrorKind,
    readonly providerStatus?: number,
  ) {
    super("Receipt vision provider request failed.");
    this.name = "ReceiptVisionProviderError";
  }
}

/** Fields the vision model is allowed to produce. The service normalizes them into a ReceiptDraft. */
export interface ReceiptVisionCandidate {
  merchant?: string;
  date?: string;
  amountMinor?: number;
  kind?: TransactionKind;
  categoryName?: string;
  items?: Array<{
    description?: string;
    amountMinor?: number;
    categoryName?: string;
  }>;
  rawText?: string;
}

export interface ReceiptVisionProvider {
  extract(env: Bindings, image: File): Promise<ReceiptVisionCandidate>;
}
