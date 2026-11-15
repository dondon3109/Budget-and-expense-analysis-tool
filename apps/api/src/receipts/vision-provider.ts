import type { ReceiptPaymentType, TransactionKind } from "@zoption/shared";

import type { Bindings } from "../types";

export const DEFAULT_RECEIPT_VISION_MODEL = "@cf/google/gemma-4-26b-a4b-it";

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
  /** Present when the image is an e-wallet, bank, or remittance confirmation. */
  payment?: {
    provider?: string;
    type?: ReceiptPaymentType;
    counterparty?: string;
    referenceNo?: string;
    feeMinor?: number;
    sentAmountMinor?: number;
    sentCurrency?: string;
    exchangeRate?: string;
  };
  rawText?: string;
}

export interface ReceiptVisionProvider {
  extract(env: Bindings, image: File): Promise<ReceiptVisionCandidate>;
}
