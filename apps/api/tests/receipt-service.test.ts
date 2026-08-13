import { CURRENT_RECEIPT_CONSENT_VERSION } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createReceiptService } from "../src/receipts/service";
import {
  ReceiptVisionProviderError,
  type ReceiptVisionProvider,
} from "../src/receipts/vision-provider";
import type { ReceiptRepository } from "../src/db/receipts";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  RECEIPT_ENTRY_ENABLED: "true",
} satisfies Bindings;

const receiptImage = () =>
  new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" });

function repository(consented = true): ReceiptRepository {
  return {
    getConsent: vi.fn(async () => ({
      consentedAt: consented ? "2026-08-12T00:00:00.000Z" : null,
      consentVersion: consented ? CURRENT_RECEIPT_CONSENT_VERSION : 0,
    })),
    grantConsent: vi.fn(async () => ({
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
    })),
  };
}

function provider(): ReceiptVisionProvider {
  return {
    extract: vi.fn(async () => ({
      merchant: "Jollibee",
      date: "08/13/2026",
      amountMinor: -28500,
      kind: "expense" as const,
      categoryName: "Food & dining",
      rawText: "JOLLIBEE 285.00",
    })),
  };
}

describe("receipt service", () => {
  it("advertises the configured vision model and consent state", async () => {
    const service = createReceiptService(repository(), provider());
    await expect(service.getPreferences(env, "tenant-id")).resolves.toMatchObject({
      enabled: true,
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
      visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
    });
  });

  it("requires receipt consent before a photo leaves Zoption", async () => {
    const vision = provider();
    const service = createReceiptService(repository(false), vision);
    const request = service.extract(env, "tenant-id", receiptImage());
    await expect(request).rejects.toMatchObject({ status: 409, code: "receipt_consent_required" });
    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("normalizes provider output into a PHP draft", async () => {
    const service = createReceiptService(repository(), provider());
    await expect(service.extract(env, "tenant-id", receiptImage())).resolves.toEqual({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: -28500,
      currency: "PHP",
      kind: "expense",
      categoryName: "Food & dining",
      rawText: "JOLLIBEE 285.00",
    });
  });

  it("defaults the kind from the amount sign and the date to today", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: " Market ",
      amountMinor: 1200,
    });
    const service = createReceiptService(repository(), vision);
    const draft = await service.extract(env, "tenant-id", receiptImage());
    expect(draft.merchant).toBe("Market");
    expect(draft.kind).toBe("income");
    expect(draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.rawText).toBe("");
  });

  it("rejects an unreadable merchant or amount with 422", async () => {
    const vision = provider();
    const service = createReceiptService(repository(), vision);

    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "   ",
      amountMinor: 28500,
    });
    await expect(service.extract(env, "tenant-id", receiptImage())).rejects.toMatchObject({
      status: 422,
      code: "receipt_merchant_unreadable",
    });

    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({ merchant: "Jollibee" });
    await expect(service.extract(env, "tenant-id", receiptImage())).rejects.toMatchObject({
      status: 422,
      code: "receipt_amount_unreadable",
    });
  });

  it.each([
    ["timeout", 504, "receipt_extraction_timeout"],
    ["rate_limit", 429, "receipt_extraction_rate_limited"],
    ["invalid_response", 502, "receipt_extraction_invalid_response"],
    ["unavailable", 503, "receipt_extraction_unavailable"],
  ] as const)("maps a %s provider failure to %i %s", async (kind, status, code) => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ReceiptVisionProviderError("cloudflare_workers_ai", kind),
    );
    const service = createReceiptService(repository(), vision);
    await expect(service.extract(env, "tenant-id", receiptImage())).rejects.toMatchObject({
      status,
      code,
    });
  });
});
